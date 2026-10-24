'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {systemExe}=require('./vault.cjs');
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
module.exports={inspectNetwork};
