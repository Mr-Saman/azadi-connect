'use strict';
const path = require('node:path');
const { isIP } = require('node:net');
const { AppError } = require('./errors.cjs');
function normalizeApp(value) {
  if (typeof value !== 'string' || value.length > 1000 || !path.win32.isAbsolute(value) || !/^[a-z]:\\/i.test(value) || !/\.exe$/i.test(value) || /[\x00-\x1f]/.test(value)) throw new AppError('invalidApp');
  return path.win32.normalize(value);
}
function buildConfig(profile, options, controller) {
  if (!profile?.endpoint?.type) throw new AppError('invalidProfile');
  if (!['apps','system'].includes(options.mode)) throw new AppError('invalidMode');
  const apps = [...new Set((options.apps || []).map(normalizeApp))];
  if (options.mode === 'apps' && !apps.length) throw new AppError('selectApps');
  const endpoint = structuredClone(profile.endpoint); endpoint.tag = 'vpn';
  const isEndpoint = ['wireguard','openvpn-client'].includes(endpoint.type);
  const rules = [{ port: 53, action: 'hijack-dns' }];
  if (options.mode === 'apps') rules.push({ process_path: apps, action: 'route', outbound: 'vpn' });
  // Do not add private-network bypasses ahead of application rules: a selected
  // application must not silently leak private-range destinations to the LAN.
  const config = {
    log: { level: 'warn', timestamp: false },
    dns: {
      servers: [
        { type: 'udp', tag: 'bootstrap', server: '1.1.1.1', server_port: 53, detour: 'direct' },
        { type: 'tls', tag: 'secure-dns', server: '1.1.1.1', server_port: 853, tls: { enabled: true, server_name: 'cloudflare-dns.com' }, detour: 'vpn' }
      ],
      final: 'secure-dns', strategy: 'prefer_ipv4', independent_cache: true
    },
    inbounds: [{ type: 'tun', tag: 'azadi-tun', interface_name: 'AzadiConnect',
      address: ['172.29.215.1/30','fd72:98c4:51af::1/126'], mtu: 1400,
      auto_route: true, strict_route: true, stack: 'mixed' }],
    outbounds: [{ type: 'direct', tag: 'direct' }, ...(isEndpoint ? [] : [endpoint])],
    route: { auto_detect_interface: true, default_domain_resolver: 'bootstrap', rules,
      final: options.mode === 'system' ? 'vpn' : 'direct' },
    experimental: { clash_api: { external_controller: `127.0.0.1:${controller.port}`, secret: controller.secret,
      access_control_allow_origin: ['http://azadi.invalid'], access_control_allow_private_network: false } }
  };
  if (isEndpoint) config.endpoints = [endpoint];
  if (profile.dns?.length && isIP(profile.dns[0])) config.dns.servers[1] = { type: 'udp', tag: 'secure-dns', server: profile.dns[0], server_port: 53, detour: 'vpn' };
  return config;
}
module.exports = { buildConfig, normalizeApp };
