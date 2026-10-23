import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {importProfiles}=require('../app/lib/importers.cjs');
const {buildConfig}=require('../app/lib/config.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const executable=process.env.AZADI_TEST_CORE || path.join(root,'resources/core',process.platform==='win32'?'sing-box.exe':'sing-box');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-check-'));
const id='bf000d23-0752-40b4-affe-68f7707a9661';
const key=Buffer.alloc(32,1).toString('base64');
const fixtureCa=await fs.readFile(path.join(root,'tests/fixtures/ca.pem'),'utf8');
const inputs=[
 `[Interface]\nPrivateKey=${key}\nAddress=10.1.1.2/32\n[Peer]\nPublicKey=${key}\nEndpoint=192.0.2.1:51820\nAllowedIPs=0.0.0.0/0,::/0`,
 `vless://${id}@example.com:443?security=tls&type=ws&path=%2Fvpn`,
 `vless://${id}@example.com:443?security=reality&pbk=${encodeURIComponent(key.replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'))}&sid=abcd`,
 'vmess://'+Buffer.from(JSON.stringify({add:'example.com',port:443,id,aid:0,net:'tcp',tls:'tls'})).toString('base64'),
 'ss://'+Buffer.from('aes-256-gcm:example-password').toString('base64')+'@example.com:8388',
 'trojan://example-password@example.com:443',
 'hy2://example-password@example.com:443',
 `tuic://${id}:example-password@example.com:443`,
 'socks5://example.com:1080',
 'https://example.com:443',
 `client\ndev tun\nremote example.com 1194\nproto udp\nremote-cert-tls server\n<ca>\n${fixtureCa}\n</ca>`
];
try {
 for(const input of inputs) {
  const profile=importProfiles(input)[0];
  for(const mode of ['apps','system']) {
   const config=buildConfig(profile,{mode,apps:['C:\\Program Files\\Example\\example.exe']},{port:19090,secret:'test-only-not-a-production-secret'});
   const file=path.join(directory,'config.json');await fs.writeFile(file,JSON.stringify(config));
   const result=spawnSync(executable,['check','-c',file],{encoding:'utf8',timeout:20000,windowsHide:true});
   if(result.status!==0)throw new Error(`${profile.protocol} / ${mode}: ${result.error?.message || result.stderr || result.stdout}`);
   console.log(`PASS ${profile.protocol} · ${mode}`);
  }
 }
} finally {await fs.rm(directory,{recursive:true,force:true});}
