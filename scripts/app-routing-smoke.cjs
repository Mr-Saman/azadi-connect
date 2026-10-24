'use strict';
// Changes default routes only on a disposable Windows VM. Exercise the actual
// production generator, Windows DNS Client and HTTPS, not a minimal TUN.
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {buildConfig}=require('../app/lib/config.cjs');
const {importProfiles}=require('../app/lib/importers.cjs');
const {encodePolicy}=require('../app/lib/network-lock.cjs');
const {freePort}=require('../app/lib/engine.cjs');
if(process.platform!=='win32'||!process.env.GITHUB_ACTIONS||!process.env.RUNNER_TEMP)throw Error('Disposable Windows GitHub runner required');
const exec=promisify(execFile),root=path.resolve(__dirname,'..'),core=path.join(root,'resources/core');
const helper=path.join(core,'network-lock.exe'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const invoke=async(...args)=>JSON.parse((await exec(helper,args,{timeout:20000,windowsHide:true})).stdout);
const probe=async(file,...args)=>{try{await exec(file,args,{timeout:20000,windowsHide:true});return true;}catch{return false;}};
const sockets=new Set(),requests=[];
let child,ownsPolicy=false,directory,logs='',upstream;
async function stopCore(crash=false) {
 if(!child)return;const current=child;child=null;
 const closed=new Promise(resolve=>current.once('close',resolve));
 if(crash)current.kill('SIGKILL');else current.stdin.end('stop');
 await Promise.race([closed,pause(7000)]);
 if(current.exitCode===null && !current.signalCode){current.kill('SIGKILL');await Promise.race([closed,pause(2000)]);}
}
async function stopUpstream() {
 if(!upstream)return;const server=upstream;upstream=null;
 for(const socket of sockets)socket.destroy();sockets.clear();
 await new Promise(resolve=>server.close(resolve));
}
(async()=>{
 // Avoid DOS 8.3 aliases in Windows process-path lookup.
 directory=await fs.mkdtemp(path.join(process.env.ProgramData,'Azadi-routing-'));
 const selected=path.join(directory,'selected.exe'),other=path.join(directory,'other.exe'),policy=path.join(directory,'scope.policy');
 await fs.copyFile(path.join(root,'test-output/network-probe.exe'),selected);await fs.copyFile(selected,other);
 try{
  assert.equal((await invoke('status')).active,false,'Existing policy: refuse to alter this machine');ownsPolicy=true;
  assert.ok(await probe(other,'--https'),'Direct HTTPS baseline is unavailable');
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script="$ErrorActionPreference='Stop'; @(Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -ne 'AzadiConnect' } | ForEach-Object { $_.ServerAddresses } | Select-Object -Unique) | ConvertTo-Json -Compress";
  const output=await exec(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:15000,windowsHide:true});
  const values=JSON.parse(output.stdout.trim()||'[]');let resolver;
  for(const candidate of Array.isArray(values)?values:[values])if(net.isIPv4(candidate)&&await probe(other,'--dns',candidate)){resolver=candidate;break;}
  assert.ok(resolver,'LAN/Wi-Fi UDP DNS baseline unavailable');
  assert.ok(await probe(other,'--name','one.one.one.one'),'Windows shared DNS baseline unavailable');
  console.log('PASS physical HTTPS, fresh Windows shared DNS and LAN resolver baseline');
  upstream=http.createServer();
  upstream.on('connect',(request,socket,head)=>{
   requests.push(request.url);sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
   const allowed=['one.one.one.one:443','1.1.1.1:443','1.0.0.1:443','[2606:4700:4700::1111]:443','[2606:4700:4700::1001]:443'];
   if(!allowed.includes(request.url)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
   const remote=net.connect(443,'1.1.1.1');sockets.add(remote);remote.on('close',()=>sockets.delete(remote));
   remote.once('connect',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket);});
   remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const profile=importProfiles('http://127.0.0.1:'+upstream.address().port+'#Synthetic-upstream')[0];
  const port=await freePort(),secret='local-routing-fixture-only';
  const config=buildConfig(profile,{mode:'apps',apps:[selected]},{port,secret});config.log.level='info';
  const filename=path.join(directory,'production-apps.json');await fs.writeFile(filename,JSON.stringify(config));
  child=spawn(path.join(core,'guardian.exe'),[path.join(core,'sing-box.exe'),filename],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.on('error',e=>{logs+=e.message;});const collect=b=>{logs=(logs+b.toString()).slice(-16000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
  let ready=false;for(let i=0;i<100;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch('http://127.0.0.1:'+port+'/version',{headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(500)});if(r.ok&&logs.includes('sing-box started')){ready=true;break;}}catch{}
   await pause(100);
  }
  assert.ok(ready,'Production app-mode configuration did not start:\n'+logs);
  const checkOther=async label=>{
   const before=requests.length;
   assert.ok(await probe(other,'--https'),label+': unrelated HTTPS failed');
   assert.ok(await probe(other,'--name','one.one.one.one'),label+': shared Windows DNS failed');
   assert.ok(await probe(other,'--dns',resolver),label+': LAN/Wi-Fi DNS was blocked');
   assert.equal(requests.length,before,label+': unrelated app reached VPN upstream');
  };
  const checkSelected=async()=>{
   const before=requests.length;assert.ok(await probe(selected,'--https'),'Selected HTTPS through VPN fixture failed');
   assert.ok(requests.length>before,'Selected executable did not reach VPN upstream');
  };
  await checkSelected();await checkOther('Kill Switch off');
  console.log('PASS production default TUN routes: selected HTTPS through upstream, unrelated HTTPS/DNS direct');
  await fs.writeFile(policy,encodePolicy('apps',[selected]));await invoke('arm',policy);assert.equal((await invoke('status')).complete,true);
  await checkSelected();await checkOther('Kill Switch on');
  console.log('PASS app Kill Switch preserves unrelated HTTPS and both shared/raw DNS');
  await stopUpstream();
  assert.equal(await probe(selected,'--https'),false,'Selected app fell back to direct Internet after upstream failure');
  await checkOther('Upstream unavailable');
  console.log('PASS failed VPN upstream does not take unrelated applications offline');
  await stopCore(true);
  assert.equal(await probe(selected,'--https'),false,'Selected app escaped the lock after core crash');
  await checkOther('Core crashed');
  console.log('PASS after core crash: selected app blocked, unrelated HTTPS and DNS remain online');
 }catch(e){console.error(e.message+'\nCore output:\n'+logs);throw e;}finally{
  await stopCore();if(ownsPolicy)await invoke('uninstall');await stopUpstream();
  await fs.rm(directory,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
