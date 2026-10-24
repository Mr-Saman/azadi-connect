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
  // The core forbids detour together with a fixed listen_port; retain that
  // explicit user requirement rather than silently changing the source port.
  const ipv4WireGuard = endpoint.type==='wireguard' && !endpoint.listen_port && endpoint.peers.length>0 && endpoint.peers.every(p=>isIP(p.address)===4 || (!isIP(p.address) && options.nativeIPv6===false));
  if(ipv4WireGuard){
    endpoint.detour='wireguard-transport';
    if(endpoint.peers.some(p=>!isIP(p.address)))endpoint.domain_resolver={server:'bootstrap',strategy:'ipv4_only'};
  }
  const isEndpoint = ['wireguard','openvpn-client'].includes(endpoint.type);
  const system = options.mode === 'system';
  const rules = system ? [{ port: 53, action: 'hijack-dns' }] : [];
  if (options.mode === 'apps') rules.push({ process_path: apps, action: 'route', outbound: 'vpn' });
  // Without a physical IPv6 default route, fail unselected TUN IPv6 quickly
  // so clients can use IPv4. Selected IPv6 stays inside the VPN over UDP4.
  if(!system && options.nativeIPv6===false)rules.push({inbound:'azadi-tun',ip_version:6,action:'reject'});
  // Do not add private-network bypasses ahead of application rules: a selected
  // application must not silently leak private-range destinations to the LAN.
  const config = {
    log: { level: 'warn', timestamp: false },
    dns: {
      servers: system ? [
        // Modern DNS transports dial directly by default. An explicit detour to
        // an empty direct outbound is rejected at runtime by sing-box 1.14.
        { type: 'udp', tag: 'bootstrap', server: '1.1.1.1', server_port: 53 },
        { type: 'tls', tag: 'secure-dns', server: '1.1.1.1', server_port: 853, tls: { enabled: true, server_name: 'cloudflare-dns.com' }, detour: 'vpn' }
      ] : [{ type: 'local', tag: 'bootstrap', prefer_go: true }],
      final: system ? 'secure-dns' : 'bootstrap', strategy: 'prefer_ipv4'
    },
    inbounds: [{ type: 'tun', tag: 'azadi-tun', interface_name: 'AzadiConnect',
      address: ['172.29.215.1/30','fd72:98c4:51af::1/126'], mtu: 1400,
      // Shared Windows DNS must remain on LAN/Wi-Fi in app mode. strict_route
      // would block non-TUN DNS; default dns_mode would replace adapter DNS.
      auto_route: true, strict_route: system, dns_mode: system ? 'hijack' : 'disabled', stack: 'mixed' }],
    outbounds: [{ type: 'direct', tag: 'direct' },
      // A non-empty direct dialer selects sing-box's client bind, avoiding the
      // standard WireGuard bind's unnecessary udp6 socket on IPv4 servers.
      ...(ipv4WireGuard?[{type:'direct',tag:'wireguard-transport',connect_timeout:'10s'}]:[]),
      ...(isEndpoint ? [] : [endpoint])],
    route: { auto_detect_interface: true, default_domain_resolver: 'bootstrap', rules,
      final: options.mode === 'system' ? 'vpn' : 'direct' },
    experimental: { clash_api: { external_controller: `127.0.0.1:${controller.port}`, secret: controller.secret,
      access_control_allow_origin: ['http://azadi.invalid'], access_control_allow_private_network: false } }
  };
  if (isEndpoint) config.endpoints = [endpoint];
  if (system && profile.dns?.length && isIP(profile.dns[0])) config.dns.servers[1] = { type: 'udp', tag: 'secure-dns', server: profile.dns[0], server_port: 53, detour: 'vpn' };
  return config;
}
module.exports = { buildConfig, normalizeApp };
