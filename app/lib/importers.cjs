'use strict';
const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const { AppError } = require('./errors.cjs');
const MAX_IMPORT = 2 * 1024 * 1024;
const fail = (detail) => { throw new AppError('invalidProfile', detail); };
function text(value, name, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`Invalid ${name}`);
  return value.trim();
}
function port(value, fallback) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) fail('Invalid server port'); return n;
}
function host(value) {
  const s = text(value, 'server', 253).replace(/^\[|\]$/g, '');
  if (!isIP(s) && (!/^[a-zA-Z0-9.-]+$/.test(s) || s.startsWith('.') || s.includes('..'))) fail('Invalid server hostname');
  return s;
}
function cidr(value) {
  const s = text(value, 'IP prefix', 80); const parts = s.split('/');
  const family = isIP(parts[0]); const p = Number(parts[1]);
  if (parts.length !== 2 || !family || !/^\d+$/.test(parts[1]) || p < 0 || p > (family === 4 ? 32 : 128)) fail('Invalid IP prefix'); return s;
}
function key(value, name) {
  const s = text(value, name, 100);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(s) || Buffer.from(s, 'base64').length !== 32) fail(`Invalid ${name}`); return s;
}
function base64(value) {
  const s = String(value).replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) fail('Invalid base64');
  return Buffer.from(s, 'base64').toString('utf8');
}
function profile(name, endpoint, dns = [], notes = []) {
  return { id: randomUUID(), name: String(name || 'Imported profile').slice(0, 100), protocol: endpoint.type,
    endpoint, dns, notes, createdAt: new Date().toISOString() };
}
function wireguard(raw, name) {
  let section; let iface; const peers = [];
  for (const original of raw.split(/\r?\n/)) {
    const line = original.replace(/\s*[#;].*$/, '').trim(); if (!line) continue;
    if (/^\[interface\]$/i.test(line)) { if (iface) fail('Duplicate Interface'); section = iface = {}; continue; }
    if (/^\[peer\]$/i.test(line)) { section = {}; peers.push(section); continue; }
    const match = /^([A-Za-z]+)\s*=\s*(.*)$/.exec(line); if (!section || !match) fail('Invalid WireGuard line');
    const field = match[1].toLowerCase();
    const allowed = section === iface ? ['privatekey','address','dns','mtu','listenport'] : ['publickey','presharedkey','endpoint','allowedips','persistentkeepalive'];
    if (!allowed.includes(field) || field in section) fail(`Unsupported or duplicate WireGuard field: ${field}`);
    section[field] = match[2].trim();
  }
  if (!iface || !peers.length || peers.length > 32) fail('WireGuard requires Interface and Peer');
  const endpoint = { type: 'wireguard', system: false, address: text(iface.address, 'Address').split(',').map(s => cidr(s.trim())),
    private_key: key(iface.privatekey, 'PrivateKey'), peers: peers.map(peer => {
      const m = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(peer.endpoint || ''); if (!m) fail('Invalid WireGuard Endpoint');
      const p = { address: host(m[1] || m[2]), port: port(m[3]), public_key: key(peer.publickey, 'PublicKey'),
        allowed_ips: text(peer.allowedips, 'AllowedIPs').split(',').map(s => cidr(s.trim())) };
      if (peer.presharedkey) p.pre_shared_key = key(peer.presharedkey, 'PresharedKey');
      if (peer.persistentkeepalive) { const n = Number(peer.persistentkeepalive); if (!Number.isInteger(n) || n < 0 || n > 65535) fail('Invalid keepalive'); p.persistent_keepalive_interval = n; }
      return p;
    }) };
  if (iface.mtu) { const n = Number(iface.mtu); if (!Number.isInteger(n) || n < 1280 || n > 9000) fail('MTU must be 1280–9000'); endpoint.mtu = n; }
  if (iface.listenport) { const n=Number(iface.listenport); if(!Number.isInteger(n)||n<0||n>65535)fail('Invalid ListenPort'); endpoint.listen_port=n; }
  const dns = (iface.dns || '').split(',').map(s => s.trim()).filter(s => isIP(s));
  return profile(name || 'WireGuard', endpoint, dns, ['AllowedIPs are preserved; this profile may only provide access to a private network.']);
}
function transport(params) {
  const type = params.get('type') || params.get('network') || 'tcp';
  if (type === 'tcp') return undefined;
  if (type === 'ws') return { type: 'ws', path: params.get('path') || '/', ...(params.get('host') ? { headers: { Host: params.get('host') } } : {}) };
  if (type === 'grpc') return { type: 'grpc', service_name: params.get('serviceName') || '' };
  if (type === 'httpupgrade') return { type: 'httpupgrade', path: params.get('path') || '/', ...(params.get('host') ? { host: params.get('host') } : {}) };
  fail(`Unsupported transport: ${type}`);
}
function tls(params, server, mandatory = false) {
  const security = params.get('security') || (mandatory ? 'tls' : 'none');
  if (['1','true'].includes(params.get('allowInsecure')) || ['1','true'].includes(params.get('insecure'))) fail('Insecure certificate verification is not supported');
  if (security === 'none' || security === '') return undefined;
  if (!['tls','reality'].includes(security)) fail('Unsupported TLS security');
  const result = { enabled: true, server_name: params.get('sni') || params.get('peer') || server };
  if (params.get('alpn')) result.alpn = params.get('alpn').split(',');
  if (params.get('fp') || security === 'reality') result.utls = { enabled: true, fingerprint: params.get('fp') || 'chrome' };
  if (security === 'reality') {
    if (!params.get('pbk')) fail('Reality public key is missing');
    result.reality = { enabled: true, public_key: params.get('pbk'), short_id: params.get('sid') || '' };
  }
  return result;
}
function uuid(value) { if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) fail('Invalid UUID'); return value; }
function link(raw, name) {
  if (raw.startsWith('vmess://')) {
    let v; try { v = JSON.parse(base64(raw.slice(8))); } catch { fail('Invalid VMess link'); }
    if (Number(v.aid || 0) !== 0) fail('Legacy VMess alterId is unsupported');
    if(v.type && v.type!=='none')fail('VMess legacy header obfuscation is unsupported');
    const p = new URLSearchParams({ type: v.net || 'tcp', security: v.tls || 'none', sni: v.sni || '', host: v.host || '', path: v.path || '/', serviceName:v.net==='grpc'?(v.path||''):'', alpn: v.alpn || '', fp: v.fp || '' });
    const e = { type: 'vmess', server: host(v.add), server_port: port(v.port), uuid: uuid(v.id), security: v.scy || 'auto', alter_id: 0 };
    const t = transport(p); const t2 = tls(p, e.server); if (t) e.transport = t; if (t2) e.tls = t2;
    return profile(name || v.ps || 'VMess', e);
  }
  if (raw.startsWith('ss://')) {
    const noPrefix = raw.slice(5); const [withoutHash, fragment = ''] = noPrefix.split('#');
    if (withoutHash.includes('plugin=')) fail('Shadowsocks plugins are not supported');
    const authority = withoutHash.split('?')[0].replace(/\/$/, '');
    const decoded = authority.includes('@') ? authority : base64(authority);
    const at = decoded.lastIndexOf('@'); if (at < 0) fail('Invalid Shadowsocks link');
    const auth = decoded.slice(0, at); const credentials = auth.includes(':') ? decodeURIComponent(auth) : base64(auth);
    const colon = credentials.indexOf(':'); if (colon < 1) fail('Invalid Shadowsocks credentials');
    const address = new URL('ss://' + decoded.slice(at + 1));
    return profile(name || decodeURIComponent(fragment) || 'Shadowsocks', { type: 'shadowsocks', server: host(address.hostname), server_port: port(address.port),
      method: credentials.slice(0, colon), password: text(credentials.slice(colon + 1), 'password') });
  }
  let u; try { u = new URL(raw); } catch { fail('Invalid share link'); }
  const proto = u.protocol.slice(0, -1); const type = proto === 'hy2' ? 'hysteria2' : proto;
  if (!['vless','trojan','hysteria2','tuic','socks','socks5','http','https'].includes(type)) fail('Unsupported share link protocol');
  const p = u.searchParams;
  const allowedQueries = new Set(['type','network','security','sni','peer','alpn','fp','pbk','sid','path','host','serviceName','flow','encryption','allowInsecure','insecure','obfs','obfs-password','congestion_control','udp_relay_mode']);
  for (const k of p.keys()) if (!allowedQueries.has(k)) fail(`Unsupported share link option: ${k}`);
  if (p.has('encryption') && p.get('encryption') !== 'none') fail('Unsupported VLESS encryption');
  const e = { type: ['socks5','socks'].includes(type) ? 'socks' : type === 'https' ? 'http' : type,
    server: host(u.hostname), server_port: port(u.port, ['http','https'].includes(type) ? (type === 'https' ? 443 : 80) : ['socks','socks5'].includes(type) ? 1080 : 443) };
  if (type === 'vless') { e.uuid = uuid(decodeURIComponent(u.username)); if (p.get('flow')) e.flow = p.get('flow'); }
  if (type === 'trojan') e.password = text(decodeURIComponent(u.username), 'password');
  if (type === 'hysteria2') {
    e.password = text(decodeURIComponent(u.username + (u.password ? ':' + u.password : '')), 'password');
    if (p.get('obfs')) { if (p.get('obfs') !== 'salamander') fail('Unsupported Hysteria2 obfuscation'); e.obfs = { type: 'salamander', password: text(p.get('obfs-password'), 'obfs password') }; }
  }
  if (type === 'tuic') { e.uuid = uuid(decodeURIComponent(u.username)); e.password = text(decodeURIComponent(u.password), 'password'); if (p.get('congestion_control')) e.congestion_control = p.get('congestion_control'); if (p.get('udp_relay_mode')) e.udp_relay_mode = p.get('udp_relay_mode'); }
  if (['socks','socks5','http','https'].includes(type)) { if (u.username) e.username = decodeURIComponent(u.username); if (u.password) e.password = decodeURIComponent(u.password); }
  const t = ['vless','trojan'].includes(type) ? transport(p) : undefined;
  const t2 = tls(p, e.server, ['trojan','hysteria2','tuic','https'].includes(type));
  if (t) e.transport = t; if (t2) e.tls = t2;
  if (['trojan','hysteria2','tuic','https'].includes(type) && !e.tls) fail('TLS is required for this protocol');
  return profile(name || decodeURIComponent(u.hash.slice(1)) || type, e,
    [], ['http','socks','socks5'].includes(type) ? ['This upstream may not encrypt traffic. HTTP does not support UDP; unsupported traffic fails.'] : []);
}
function openvpn(raw, name, credentials = {}) {
  const blocks = {}; const clean = raw.replace(/<([a-z][a-z0-9-]*)>\s*([\s\S]*?)\s*<\/\1>/gi, (_, tag, value) => { tag = tag.toLowerCase(); if (blocks[tag]) fail('Duplicate inline OpenVPN block'); blocks[tag] = value.trim(); return ''; });
  if (/[<>]/.test(clean)) fail('Unsupported OpenVPN block');
  const knownBlocks = ['ca','cert','key','tls-auth','tls-crypt','tls-crypt-v2'];
  for (const k of Object.keys(blocks)) if (!knownBlocks.includes(k)) fail(`Unsupported inline OpenVPN block: ${k}`);
  const e = { type: 'openvpn-client', mode: 'tls', system: false, servers: [], route_no_pull: true,
    tls: { version_min: '1.2', remote_certificate_tls: 'server' }, allow_compression: 'no' };
  const safeNoop = new Set(['client','tls-client','pull','nobind','persist-key','persist-tun','auth-nocache','verb','mute','mute-replay-warnings','resolv-retry','connect-retry','connect-retry-max','redirect-gateway','block-outside-dns','register-dns','route-nopull','route-delay','explicit-exit-notify','dhcp-option','sndbuf','rcvbuf']);
  let authRequired = false;
  for (const original of clean.split(/\r?\n/)) {
    const line = original.trim(); if (!line || /^[#;]/.test(line)) continue;
    const parts = line.match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+/g).map(v => v.replace(/^['"]|['"]$/g, ''));
    const [k, ...a] = parts;
    if (safeNoop.has(k)) continue;
    if (k === 'dev') { if (a[0] !== 'tun') fail('OpenVPN TAP profiles are unsupported'); }
    else if (k === 'proto') { if (!['udp','udp4','udp6','tcp-client','tcp4-client','tcp6-client','tcp'].includes(a[0])) fail('Unsupported OpenVPN transport'); e.network = a[0].startsWith('tcp') ? 'tcp' : 'udp'; }
    else if (k === 'remote') { if (a.length < 1 || a.length > 3) fail('Invalid OpenVPN remote'); const r = { server: host(a[0]), server_port: port(a[1],1194) }; if (a[2]) { if (!['udp','udp4','udp6','tcp','tcp-client','tcp4-client','tcp6-client'].includes(a[2])) fail('Invalid remote protocol'); r.network = a[2].startsWith('tcp') ? 'tcp' : 'udp'; } e.servers.push(r); }
    else if (k === 'remote-random') e.remote_random = true;
    else if (k === 'auth-user-pass') { if (a.length) fail('External credential files are not imported'); authRequired = true; }
    else if (k === 'remote-cert-tls') { if (a[0] !== 'server') fail('Server certificate verification is required'); }
    else if (k === 'verify-x509-name') { if (a[1] && !['name','subject','name-prefix'].includes(a[1])) fail('Unsupported X509 check'); e.tls.server_name = text(a[0],'certificate name'); e.tls.server_name_type = a[1] || 'subject'; }
    else if (k === 'tls-version-min') { if (!['1.2','1.3'].includes(a[0])) fail('TLS 1.2 or newer is required'); e.tls.version_min = a[0]; }
    else if (k === 'data-ciphers') e.data_ciphers = text(a[0],'data ciphers').split(':');
    else if (k === 'cipher' || k === 'data-ciphers-fallback') { if (!/^AES-(128|192|256)-(GCM|CBC)$/.test(a[0]) && a[0] !== 'CHACHA20-POLY1305') fail('Unsupported OpenVPN cipher'); e.data_ciphers_fallback = a[0]; }
    else if (k === 'auth') { if (!['SHA1','SHA256','SHA384','SHA512'].includes(a[0])) fail('Unsupported digest'); e.auth = a[0]; }
    else if (k === 'key-direction') { if (!['0','1'].includes(a[0])) fail('Invalid key direction'); blocks.direction = a[0] === '1' ? 'client' : 'server'; }
    else if (k === 'tun-mtu') { const n = Number(a[0]); if (!Number.isInteger(n) || n < 1280 || n > 9000) fail('Invalid MTU'); e.mtu = n; }
    else if (k === 'ping' || k === 'ping-restart') { const n = Number(a[0]); if (!Number.isInteger(n) || n < 1 || n > 86400) fail('Invalid ping interval'); e[k === 'ping' ? 'ping_interval' : 'ping_restart'] = `${n}s`; }
    else fail(`Unsupported OpenVPN option: ${k}. Inline CA/certificate/key are required; scripts/plugins/external files are never executed.`);
  }
  if (!e.servers.length || !blocks.ca) fail('OpenVPN requires remote and inline <ca>');
  if (!!blocks.cert !== !!blocks.key) fail('OpenVPN certificate and key must be provided together');
  if (blocks.key && /ENCRYPTED/.test(blocks.key)) fail('Encrypted OpenVPN private keys are not supported in this version');
  e.tls.certificate = [blocks.ca]; if (blocks.cert) { e.tls.client_certificate = [blocks.cert]; e.tls.client_key = [blocks.key]; }
  const wraps = ['tls-auth','tls-crypt','tls-crypt-v2'].filter(k => blocks[k]); if (wraps.length > 1) fail('Conflicting TLS wrappers');
  if (wraps.length) { const k = wraps[0]; e.tls.control_wrap = { type: k.replace(/-/g,'_'), key: [blocks[k]] }; if (k === 'tls-auth' && blocks.direction) e.tls.control_wrap.direction = blocks.direction; }
  if (authRequired) { e.username = text(credentials.username, 'OpenVPN username'); e.password = text(credentials.password, 'OpenVPN password'); }
  return profile(name || 'OpenVPN', e, [], ['OpenVPN TLS/TUN profiles only. MFA, TAP, external files, scripts and plugins are unsupported.']);
}
function importProfiles(raw, filename = '', credentials = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_IMPORT || !raw.trim()) fail('Profile is empty or too large');
  raw = raw.replace(/^\uFEFF/, '').trim();
  const name = filename.replace(/\.[^.]+$/, '').slice(0,100);
  if (/\[interface\]/i.test(raw)) return [wireguard(raw,name)];
  if (/\.ovpn$/i.test(filename) || /^client\s*$/m.test(raw) || /<ca>/.test(raw)) return [openvpn(raw,name,credentials)];
  if (raw.startsWith('{') || raw.startsWith('[')) fail('Raw engine JSON is not accepted. Import individual share links or WireGuard/OpenVPN files.');
  let lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes('://')) lines = base64(raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length || lines.length > 200) fail('Import 1–200 share links at once');
  return lines.map(s => link(s, lines.length === 1 ? name : ''));
}
module.exports = { importProfiles, wireguard, openvpn, link, MAX_IMPORT, cidr, port, host };
