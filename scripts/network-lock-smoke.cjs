'use strict';
// Run ONLY on a disposable Windows GitHub runner. This briefly installs real
// persistent WFP rules and a single /32 test route, then removes only our rules.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {freePort}=require('../app/lib/engine.cjs');
const {encodePolicy}=require('../app/lib/network-lock.cjs');
if(process.platform!=='win32'||!process.env.GITHUB_ACTIONS||!process.env.RUNNER_TEMP)throw Error('Disposable Windows GitHub runner required');
const root=path.resolve(__dirname,'..'),core=path.join(root,'resources/core');
const helper=path.join(core,'network-lock.exe'),guardian=path.join(core,'guardian.exe'),binary=path.join(core,'sing-box.exe');
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ps=script=>exec(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:15000,windowsHide:true});
const invoke=async(...args)=>JSON.parse((await exec(helper,args,{timeout:20000,windowsHide:true})).stdout);
const probe=async(file,ip='1.1.1.1')=>{try{await exec(file,[ip],{timeout:5000,windowsHide:true});return true;}catch{return false;}};
let child,routeAdded=false,directory,ownsPolicy=false;
async function stop() {
 if(!child)return;const p=child;child=null;
 const exit=new Promise(r=>p.once('close',r));
 p.kill('SIGKILL');await Promise.race([exit,pause(5000)]);
}
async function start(tun) {
 const port=await freePort(),proxyPort=await freePort(),secret='local-test-only';
 const file=path.join(directory,'test-core.json');
 const config={log:{level:'info'},inbounds:[{type:'http',tag:'proxy',listen:'127.0.0.1',listen_port:proxyPort}],
   outbounds:[{type:'direct',tag:'direct'}],route:{auto_detect_interface:true,final:'direct'},
   experimental:{clash_api:{external_controller:'127.0.0.1:'+port,secret}}};
 if(tun)config.inbounds.push({type:'tun',tag:'tun',interface_name:'AzadiConnect',address:['172.29.215.1/30','fd72:98c4:51af::1/126'],auto_route:false,strict_route:false,stack:'mixed'});
 await fs.writeFile(file,JSON.stringify(config));
 child=spawn(guardian,[binary,file],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let logs='';child.stderr.on('data',b=>logs+=b);child.stdout.on('data',b=>logs+=b);
 let up=false;
 for(let i=0;i<100;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch('http://127.0.0.1:'+port+'/version',{headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(500)});if(r.ok){up=true;break;}}catch{}
   await pause(100);
 }
 assert.ok(up,'Core/TUN failed to start under guardian:\n'+logs);
 return proxyPort;
}
async function throughCore(port) {
 return new Promise((resolve,reject)=>{
   const socket=net.connect(port,'127.0.0.1');let buffer='';
   socket.setTimeout(5000,()=>socket.destroy(Error('proxy timeout')));
   socket.once('error',reject);
   socket.once('connect',()=>socket.write('CONNECT 1.1.1.1:443 HTTP/1.1\r\nHost: 1.1.1.1:443\r\n\r\n'));
   socket.on('data',b=>{buffer+=b;if(buffer.includes('\r\n\r\n')){socket.destroy();resolve(/^HTTP\/1\.[01] 200/.test(buffer));}});
 });
}
(async()=>{
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-network-smoke-'));
 const selected=path.join(directory,'selected.exe'),other=path.join(directory,'other.exe'),policy=path.join(directory,'scope.policy');
 await fs.copyFile(path.join(root,'test-output/network-probe.exe'),selected);await fs.copyFile(selected,other);
 try{
   assert.equal((await invoke('status')).active,false,'Runner already has an Azadi policy; refuse to overwrite it');
   ownsPolicy=true;
   assert.ok(await probe(selected),'IPv4 baseline unavailable');
   const ipv6='2606:4700:4700::1111',hasIPv6=await probe(selected,ipv6);
   // Isolated Wintun startup: no default route or DNS mutation.
   await start(true);
   await ps("New-NetRoute -DestinationPrefix '1.1.1.1/32' -InterfaceAlias 'AzadiConnect' -NextHop '0.0.0.0' -RouteMetric 1 -PolicyStore ActiveStore -ErrorAction Stop | Out-Null");
   routeAdded=true;
   assert.ok(await probe(selected),'Fixture traffic did not traverse the test TUN route');
   await fs.writeFile(policy,encodePolicy('apps',[selected]));await invoke('arm',policy);
   assert.equal((await invoke('status')).complete,true);
   assert.ok(await probe(selected),'Kill Switch incorrectly blocked the TUN path');
   console.log('PASS Wintun + guardian startup and permitted TUN traffic');
   await stop();
   await ps("Get-NetRoute -DestinationPrefix '1.1.1.1/32' -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -eq 'AzadiConnect' } | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue");
   routeAdded=false;
   assert.equal(await probe(selected),false,'Selected app leaked over the physical interface after a core crash');
   assert.ok(await probe(other),'Unselected app was blocked in app mode');
   if(hasIPv6)assert.equal(await probe(selected,ipv6),false,'Selected app leaked IPv6');
   else console.log('INFO runner has no public IPv6 route; IPv6 WFP filters are installed, live IPv6 not exercised');
   // Invalid replacement must preserve the previously active policy.
   await fs.writeFile(policy,Buffer.from('invalid'));
   await assert.rejects(invoke('arm',policy));
   assert.equal((await invoke('status')).active,true);
   assert.equal(await probe(selected),false);
   console.log('PASS persistent per-app block after core/guardian crash; unrelated app stays online');
   const proxyPort=await start(false);
   await fs.writeFile(policy,encodePolicy('system'));await invoke('arm',policy);
   assert.equal((await invoke('status')).complete,true);
   assert.equal(await probe(other),false,'System mode allowed direct fixture traffic');
   assert.ok(await throughCore(proxyPort),'Engine exception or loopback control was blocked');
   console.log('PASS full-system physical block and engine-only transport exception');
 }finally{
   if(ownsPolicy){await invoke('unlock');assert.equal((await invoke('status')).active,false);}
   await stop();
   if(routeAdded)await ps("Get-NetRoute -DestinationPrefix '1.1.1.1/32' -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -eq 'AzadiConnect' } | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue");
 }
 assert.ok(await probe(selected),'Recovery did not restore direct connectivity');
 console.log('PASS explicit recovery restores direct Internet');
 await fs.rm(directory,{recursive:true,force:true});
})().catch(async e=>{console.error(e.message);await stop();process.exitCode=1;});
