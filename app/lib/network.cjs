'use strict';
const dns=require('node:dns/promises');
const {isIP}=require('node:net');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {systemExe}=require('./vault.cjs');
const {AppError}=require('./errors.cjs');
const exec=promisify(execFile);
async function inspectNetwork() {
  if(process.platform!=='win32')return {ipv6:null};
  // Read only: never enable/disable IPv6 or change Windows adapter settings.
  const script="$ErrorActionPreference='Stop'; $routes=@(Get-NetRoute -PolicyStore ActiveStore | Where-Object { $_.DestinationPrefix -eq '::/0' -and $_.InterfaceAlias -ne 'AzadiConnect' -and $_.State -ne 'Unreachable' }); [bool]($routes.Count) | ConvertTo-Json -Compress";
  try {
    const {stdout}=await exec(systemExe('WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:4096});
    const ipv6=JSON.parse(stdout.trim());return {ipv6:typeof ipv6==='boolean'?ipv6:null};
  }catch{return {ipv6:null};}
}
async function prepareTransportProfile(profile,lookup=dns.lookup) {
  const prepared=structuredClone(profile);
  if(prepared.endpoint?.type!=='wireguard')return prepared;
  // Resolve peer names before installing the TUN. Prefer an A record when
  // available; keep IPv6-only peers and all inner addresses/AllowedIPs intact.
  // A numeric IPv4 peer can use the core's connected UDP client transport.
  await Promise.all(prepared.endpoint.peers.map(async peer=>{
    if(isIP(peer.address))return;
    let timer;
    try {
      const addresses=await Promise.race([lookup(peer.address,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS timeout')),6000);})]);
      const chosen=addresses.find(a=>a.family===4)||addresses.find(a=>a.family===6);
      if(!chosen||!isIP(chosen.address))throw Error('No peer address');
      peer.address=chosen.address;
    }catch{throw new AppError('bootstrapFailed','WireGuard peer hostname resolution failed');}
    finally{clearTimeout(timer);}
  }));
  return prepared;
}
module.exports={inspectNetwork,prepareTransportProfile};
