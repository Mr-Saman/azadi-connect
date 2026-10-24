'use strict';
// Real encrypted WireGuard traffic, on a disposable Windows CI VM only.
// Temporarily disable the physical adapters' IPv6 binding, then restore it.
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),dgram=require('node:dgram');
const assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process');const {promisify}=require('node:util');
const {Engine,scrub}=require('../app/lib/engine.cjs');const {importProfiles}=require('../app/lib/importers.cjs');
if(process.platform!=='win32'||!process.env.GITHUB_ACTIONS||!process.env.RUNNER_TEMP)throw Error('Disposable Windows GitHub runner required');
const exec=promisify(execFile),root=path.resolve(__dirname,'..'),core=path.join(root,'resources/core'),executable=path.join(core,'sing-box.exe');
const psExe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps=async script=>(await exec(psExe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{timeout:30000,windowsHide:true})).stdout.trim();
const quote=s=>"'"+s.replace(/'/g,"''")+"'",pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,engine,directory,bindings=[],serverLogs='',clientLogs='';
const secrets=[];
async function keypair(){const r=await exec(executable,['generate','wg-keypair'],{timeout:10000,windowsHide:true});const privateKey=r.stdout.match(/PrivateKey:\s*(\S+)/)[1],publicKey=r.stdout.match(/PublicKey:\s*(\S+)/)[1];secrets.push(privateKey,publicKey);return {privateKey,publicKey};}
async function restoreBindings(){for(const name of bindings)await ps('Enable-NetAdapterBinding -Name '+quote(name)+' -ComponentID ms_tcpip6 -Confirm:$false | Out-Null');bindings=[];}
(async()=>{
 directory=await fs.mkdtemp(path.join(process.env.ProgramData,'Azadi-WG-'));
 try{
  // Azure may expose hardware/VF adapters with no configurable IP bindings.
  // Inspect the adapters actually carrying the native IPv4 default route.
  const baseline=JSON.parse(await ps("$names=@(Get-NetRoute -PolicyStore ActiveStore | Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' -and $_.InterfaceAlias -ne 'AzadiConnect' } | Select-Object -ExpandProperty InterfaceAlias -Unique); @(Get-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -and $_.Name -in $names } | Select-Object -ExpandProperty Name -Unique) | ConvertTo-Json -Compress")||'[]');
  bindings=Array.isArray(baseline)?baseline:[baseline];
  for(const name of bindings)await ps('Disable-NetAdapterBinding -Name '+quote(name)+' -ComponentID ms_tcpip6 -Confirm:$false | Out-Null');
  console.log(bindings.length?'INFO isolated runner: native IPv6 bindings disabled for the regression; no registry or reboot changes':'INFO runner exposes no enabled IPv6 binding on the native default adapter; verifying its IPv4-only path');
  const clientKey=await keypair(),serverKey=await keypair(),wrongKey=await keypair();
  const udp=dgram.createSocket('udp4');await new Promise(r=>udp.bind(0,'127.0.0.1',r));const udpPort=udp.address().port;await new Promise(r=>udp.close(r));
  // Use an ordinary publicly validated HTTPS destination. The Clash URL-test
  // API creates its own context and does not inherit custom certificate pools.
  const url='https://1.1.1.1/cdn-cgi/trace';
  const physical=await ps("(Get-NetRoute -PolicyStore ActiveStore | Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' -and $_.InterfaceAlias -ne 'AzadiConnect' } | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias");
  assert.ok(physical,'Native IPv4 default interface unavailable');
  const serverConfig={log:{level:'debug'},endpoints:[{type:'wireguard',tag:'server',system:false,address:['10.253.0.1/32'],private_key:serverKey.privateKey,listen_port:udpPort,inet4_bind_address:'0.0.0.0',peers:[{public_key:clientKey.publicKey,allowed_ips:['10.253.0.2/32']}]}],outbounds:[{type:'direct',tag:'direct',bind_interface:physical}],route:{final:'direct'}};
  const file=path.join(directory,'server.json');await fs.writeFile(file,JSON.stringify(serverConfig));
  server=spawn(path.join(core,'guardian.exe'),[executable,file],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const collect=b=>{serverLogs=(serverLogs+b.toString()).slice(-24000);};server.stdout.on('data',collect);server.stderr.on('data',collect);server.on('error',e=>{serverLogs+=e.message;});
  for(let i=0;i<100&&!serverLogs.includes('sing-box started')&&server.exitCode===null;i++)await pause(100);
  assert.ok(serverLogs.includes('sing-box started'),'Fixture server did not start');
  const makeProfile=publicKey=>importProfiles('[Interface]\nPrivateKey='+clientKey.privateKey+'\nAddress=10.253.0.2/32\n[Peer]\nPublicKey='+publicKey+'\nEndpoint=127.0.0.1:'+udpPort+'\nAllowedIPs=1.1.1.1/32')[0];
  engine=new Engine(core,path.join(directory,'client'),{healthTargets:[{name:'encrypted-https-fixture',url}],spawn:(...args)=>{
   // Only verbose logging is changed for the fixture; TLS remains unmodified.
   if(args[1][0]==='check'){
    const configFile=args[1][2],config=JSON.parse(syncFs.readFileSync(configFile,'utf8'));
    config.log.level='debug';
    syncFs.writeFileSync(configFile,JSON.stringify(config));
   }
   const c=spawn(...args),collect=b=>{clientLogs=(clientLogs+b.toString()).slice(-24000);};c.stdout?.on('data',collect);c.stderr?.on('data',collect);return c;
  }});await engine.initialize();
  const connections=()=>serverLogs.split('inbound connection to 1.1.1.1:443').length-1;
  const options={mode:'apps',apps:[path.join(root,'test-output/network-probe.exe')]};
  await engine.connect(makeProfile(serverKey.publicKey),options);
  assert.equal(engine.state.status,'connected');assert.equal(engine.state.ipv4Compatibility,true,'Native IPv6 detection did not report IPv4 compatibility');assert.ok(connections()>0,'WireGuard gateway received no HTTPS connection');
  assert.doesNotMatch(clientLogs,/unable to update bind|listen udp6.*invalid argument/i);
  console.log('PASS actual WireGuard handshake and certificate-validated HTTPS over encrypted UDP4 with physical IPv6 disabled, using production Engine + TUN');
  await restoreBindings();await pause(1000);
  const before=connections();
  const result=await engine.api('/proxies/vpn/delay?timeout=5000&url='+encodeURIComponent(url),7000);
  assert.ok(Number.isFinite(result.delay));assert.ok(connections()>before);assert.doesNotMatch(clientLogs,/unable to update bind/i);
  console.log('PASS WireGuard survives physical adapter rebind and retains the VPN path');
  await engine.stop();const validRequests=connections();
  await assert.rejects(engine.connect(makeProfile(wrongKey.publicKey),options),{code:'healthFailed'});
  assert.equal(engine.state.status,'error');assert.equal(connections(),validRequests);
  console.log('PASS wrong WireGuard key fails the probe and never falls back to a direct connection');
 }catch(e){console.error('Failure: '+scrub(e.message,secrets));console.error('Server: '+scrub(serverLogs,secrets));console.error('Client: '+scrub(clientLogs,secrets));throw e;}
 finally{
  await engine?.stop();
  if(server&&server.exitCode===null){server.stdin.end('stop');await Promise.race([new Promise(r=>server.once('close',r)),pause(6000)]);if(server.exitCode===null)server.kill('SIGKILL');}
  try{await restoreBindings();}finally{await fs.rm(directory,{recursive:true,force:true});}
 }
})().catch(()=>{process.exitCode=1;});
