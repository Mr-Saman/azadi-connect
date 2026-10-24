const { test } = require('node:test');
const assert = require('node:assert/strict');
const { importProfiles } = require('../app/lib/importers.cjs');
const { buildConfig, normalizeApp } = require('../app/lib/config.cjs');
const { scrub } = require('../app/lib/engine.cjs');
const privateKey = Buffer.alloc(32,1).toString('base64');
const publicKey = Buffer.alloc(32,2).toString('base64');
const wg = `[Interface]\nPrivateKey=${privateKey}\nAddress=10.8.0.2/32, fd00::2/128\nDNS=10.8.0.1\n[Peer]\nPublicKey=${publicKey}\nEndpoint=[2001:db8::1]:51820\nAllowedIPs=0.0.0.0/0, ::/0\nPersistentKeepalive=25`;
const uuid = 'bf000d23-0752-40b4-affe-68f7707a9661';
test('WireGuard handles IPv6 endpoints, addresses, DNS and keepalive',()=>{
 const p=importProfiles(wg,'my.conf')[0]; assert.equal(p.name,'my'); assert.equal(p.endpoint.peers[0].address,'2001:db8::1'); assert.equal(p.endpoint.peers[0].persistent_keepalive_interval,25); assert.deepEqual(p.dns,['10.8.0.1']);
});
test('WireGuard executable hooks and duplicate keys are rejected',()=>{
 assert.throws(()=>importProfiles(wg.replace('Address=','PostUp=cmd.exe\nAddress=')));
 assert.throws(()=>importProfiles(wg.replace('Address=','PrivateKey='+privateKey+'\nAddress=')));
});
test('invalid keys and prefixes cannot become routes',()=>{
 assert.throws(()=>importProfiles(wg.replace(privateKey,'bad'))); assert.throws(()=>importProfiles(wg.replace('10.8.0.2/32','10.8.0.2/99')));
});
test('VLESS Reality and websocket details survive import',()=>{
 const p=importProfiles(`vless://${uuid}@example.com:443?security=reality&pbk=examplePublicKey&sid=abcd&type=ws&path=%2Fvpn&host=cdn.example.com#Demo`)[0];
 assert.equal(p.name,'Demo'); assert.equal(p.endpoint.tls.utls.fingerprint,'chrome'); assert.equal(p.endpoint.transport.headers.Host,'cdn.example.com');
});
test('insecure TLS and unsupported VLESS options are rejected',()=>{
 assert.throws(()=>importProfiles(`vless://${uuid}@example.com:443?security=tls&allowInsecure=1`));
 assert.throws(()=>importProfiles(`vless://${uuid}@example.com:443?type=xhttp`));
 assert.throws(()=>importProfiles(`vless://${uuid}@example.com:443?arbitrary=1`));
});
test('VMess JSON links and offline base64 lists are imported',()=>{
 const a='vmess://'+Buffer.from(JSON.stringify({add:'example.com',port:'443',id:uuid,aid:0,net:'grpc',tls:'tls',path:'svc',ps:'VM'})).toString('base64');
 assert.equal(importProfiles(a)[0].endpoint.type,'vmess');
 assert.equal(importProfiles(Buffer.from(a+'\n'+'trojan://pass@example.com:443').toString('base64')).length,2);
});
test('Shadowsocks accepts SIP002 credentials and full base64',()=>{
 const p=importProfiles('ss://'+Buffer.from('aes-256-gcm:very:complex').toString('base64')+'@example.com:8388#SS')[0];
 assert.equal(p.endpoint.password,'very:complex');
 assert.equal(importProfiles('ss://'+Buffer.from('chacha20-ietf-poly1305:pass@example.com:8388').toString('base64'))[0].endpoint.server,'example.com');
 assert.throws(()=>importProfiles('ss://'+Buffer.from('aes-256-gcm:pass').toString('base64')+'@example.com:8388?plugin=evil'));
});
test('Trojan, Hysteria2, TUIC and SOCKS imports have correct types',()=>{
 assert.equal(importProfiles('trojan://secret@example.com:443')[0].endpoint.tls.enabled,true);
 assert.equal(importProfiles('hy2://secret@example.com:443?obfs=salamander&obfs-password=abc')[0].endpoint.obfs.password,'abc');
 assert.equal(importProfiles(`tuic://${uuid}:secret@example.com:443`)[0].endpoint.password,'secret');
 assert.equal(importProfiles('socks5://user:pass@example.com:1080')[0].endpoint.type,'socks');
});
const ovpn='client\ndev tun\nproto udp\nremote example.com 1194\nremote-cert-tls server\nverify-x509-name vpn.example.com name\n<ca>\n-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n</ca>';
test('OpenVPN inline TLS profile is converted without executing options',()=>{
 const e=importProfiles(ovpn,'demo.ovpn')[0].endpoint; assert.equal(e.type,'openvpn-client'); assert.equal(e.system,false); assert.equal(e.route_no_pull,true); assert.equal(e.tls.server_name,'vpn.example.com');
});
test('OpenVPN scripts, plugins, paths, TAP and weak TLS fail closed',()=>{
 for(const suffix of ['\nup evil.cmd','\nplugin bad.dll','\nca C:\\secret.crt','\ntls-version-min 1.0','\ndev tap']) assert.throws(()=>importProfiles(ovpn+suffix,'x.ovpn'));
});
test('OpenVPN credentials are required for auth-user-pass',()=>{
 assert.throws(()=>importProfiles(ovpn+'\nauth-user-pass','x.ovpn'));
 assert.equal(importProfiles(ovpn+'\nauth-user-pass','x.ovpn',{username:'u',password:'p'})[0].endpoint.username,'u');
});
test('raw engine JSON, empty and oversized imports are rejected',()=>{
 for(const raw of ['','{}','[]','x'.repeat(2097153)]) assert.throws(()=>importProfiles(raw));
});
test('selected-application rules precede direct default and preserve exact paths',()=>{
 const c=buildConfig(importProfiles(wg)[0],{mode:'apps',apps:['C:\\Program Files\\App\\app.exe']},{port:9090,secret:'secret'});
 assert.equal(c.route.final,'direct'); assert.equal(c.route.rules[0].outbound,'vpn'); assert.deepEqual(c.route.rules[0].process_path,['C:\\Program Files\\App\\app.exe']);
 assert.equal(c.route.rules.length,1);assert.equal(c.inbounds[0].strict_route,false);assert.equal(c.inbounds[0].dns_mode,'disabled');
 assert.deepEqual(c.dns.servers,[{type:'local',tag:'bootstrap',prefer_go:true}]);assert.equal(c.dns.final,'bootstrap');
 assert.equal(c.experimental.clash_api.external_controller,'127.0.0.1:9090');
});
test('full-system routing uses VPN default for both IP versions',()=>{
 const c=buildConfig(importProfiles(wg)[0],{mode:'system',apps:[]},{port:9090,secret:'s'});
 assert.equal(c.route.final,'vpn'); assert.equal(c.inbounds[0].address.length,2); assert.equal(c.inbounds[0].strict_route,true);
 assert.equal(c.inbounds[0].dns_mode,'hijack');assert.equal(c.route.rules[0].action,'hijack-dns');assert.equal(c.dns.servers[1].detour,'vpn');
});
test('no empty app mode, shell paths, relative executables or non-executables',()=>{
 const p=importProfiles(wg)[0]; assert.throws(()=>buildConfig(p,{mode:'apps',apps:[]},{port:9090,secret:'s'}));
 for(const s of ['app.exe','\\\\host\\app.exe','C:\\test.cmd','C:\\bad\n.exe']) assert.throws(()=>normalizeApp(s));
});
test('log redaction removes known secrets and key-like blobs',()=>{
 assert.ok(!scrub('key '+privateKey).includes(privateKey)); assert.equal(scrub('password abcdefg',['abcdefg']),'password [redacted]');
});
