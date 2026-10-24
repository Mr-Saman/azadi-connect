'use strict';
// Real encrypted WireGuard traffic, on a disposable Windows CI VM only.
// Temporarily disable the physical adapters' IPv6 binding, then restore it.
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),https=require('node:https'),dgram=require('node:dgram');
const assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process');const {promisify}=require('node:util');
const {Engine,scrub}=require('../app/lib/engine.cjs');const {importProfiles}=require('../app/lib/importers.cjs');
if(process.platform!=='win32'||!process.env.GITHUB_ACTIONS||!process.env.RUNNER_TEMP)throw Error('Disposable Windows GitHub runner required');
const exec=promisify(execFile),root=path.resolve(__dirname,'..'),core=path.join(root,'resources/core'),executable=path.join(core,'sing-box.exe');
const psExe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps=async script=>(await exec(psExe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{timeout:30000,windowsHide:true})).stdout.trim();
const quote=s=>"'"+s.replace(/'/g,"''")+"'",pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,engine,fixture,directory,bindings=[],serverLogs='',clientLogs='',requests=0;
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
  // The pinned Clash API deliberately replaces http:// probe URLs with its
  // default public HTTPS target. Use real TLS and a test-only trusted CA.
  const certFile=path.join(directory,'fixture.crt'),keyFile=path.join(directory,'fixture.key');
  const openssl=path.join(process.env.ProgramFiles,'Git/usr/bin/openssl.exe');
  await exec(openssl,['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1','-keyout',keyFile,'-out',certFile,'-subj','/CN=Azadi WireGuard CI','-addext','subjectAltName=IP:10.253.0.1','-addext','basicConstraints=critical,CA:TRUE'],{timeout:20000,windowsHide:true});
  const certificate=await fs.readFile(certFile,'utf8');
  fixture=https.createServer({key:await fs.readFile(keyFile),cert:certificate},(req,res)=>{requests++;res.writeHead(204);res.end();});
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  const url='https://10.253.0.1:'+fixture.address().port+'/wireguard-fixture';
  const serverConfig={log:{level:'debug'},endpoints:[{type:'wireguard',tag:'server',system:false,address:['10.253.0.1/32'],private_key:serverKey.privateKey,listen_port:udpPort,peers:[{public_key:clientKey.publicKey,allowed_ips:['10.253.0.2/32']}]}],outbounds:[{type:'direct',tag:'direct'}],route:{final:'direct'}};
  const file=path.join(directory,'server.json');await fs.writeFile(file,JSON.stringify(serverConfig));
  server=spawn(path.join(core,'guardian.exe'),[executable,file],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const collect=b=>{serverLogs=(serverLogs+b.toString()).slice(-24000);};server.stdout.on('data',collect);server.stderr.on('data',collect);server.on('error',e=>{serverLogs+=e.message;});
  for(let i=0;i<100&&!serverLogs.includes('sing-box started')&&server.exitCode===null;i++)await pause(100);
  assert.ok(serverLogs.includes('sing-box started'),'Fixture server did not start');
  const makeProfile=publicKey=>importProfiles('[Interface]\nPrivateKey='+clientKey.privateKey+'\nAddress=10.253.0.2/32\n[Peer]\nPublicKey='+publicKey+'\nEndpoint=127.0.0.1:'+udpPort+'\nAllowedIPs=10.253.0.1/32')[0];
  engine=new Engine(core,path.join(directory,'client'),{healthTargets:[{name:'encrypted-local-fixture',url}],spawn:(...args)=>{
   // Only the ephemeral fixture changes the trust root and log level. No
   // Windows certificate store or production TLS setting is modified.
   if(args[1][0]==='check'){
    const configFile=args[1][2],config=JSON.parse(syncFs.readFileSync(configFile,'utf8'));
    config.certificate={store:'none',certificate:[certificate]};config.log.level='debug';
    syncFs.writeFileSync(configFile,JSON.stringify(config));
   }
   const c=spawn(...args),collect=b=>{clientLogs=(clientLogs+b.toString()).slice(-24000);};c.stdout?.on('data',collect);c.stderr?.on('data',collect);return c;
  }});await engine.initialize();
  const options={mode:'apps',apps:[path.join(root,'test-output/network-probe.exe')]};
  await engine.connect(makeProfile(serverKey.publicKey),options);
  assert.equal(engine.state.status,'connected');assert.equal(engine.state.ipv4Compatibility,true,'Native IPv6 detection did not report IPv4 compatibility');assert.ok(requests>0,'TLS fixture received no request');
  assert.doesNotMatch(clientLogs,/unable to update bind|listen udp6.*invalid argument/i);
  console.log('PASS actual WireGuard handshake and certificate-validated HTTPS over encrypted UDP4 with physical IPv6 disabled, using production Engine + TUN');
  await restoreBindings();await pause(1000);
  const before=requests;
  const result=await engine.api('/proxies/vpn/delay?timeout=5000&url='+encodeURIComponent(url),7000);
  assert.ok(Number.isFinite(result.delay));assert.ok(requests>before);assert.doesNotMatch(clientLogs,/unable to update bind/i);
  console.log('PASS WireGuard survives physical adapter rebind and retains the VPN path');
  await engine.stop();const validRequests=requests;
  await assert.rejects(engine.connect(makeProfile(wrongKey.publicKey),options),{code:'healthFailed'});
  assert.equal(engine.state.status,'error');assert.equal(requests,validRequests);
  console.log('PASS wrong WireGuard key fails the probe and never falls back to a direct connection');
 }catch(e){console.error('Failure: '+scrub(e.message,secrets));console.error('Server: '+scrub(serverLogs,secrets));console.error('Client: '+scrub(clientLogs,secrets));throw e;}
 finally{
  await engine?.stop();
  if(server&&server.exitCode===null){server.stdin.end('stop');await Promise.race([new Promise(r=>server.once('close',r)),pause(6000)]);if(server.exitCode===null)server.kill('SIGKILL');}
  try{await restoreBindings();}finally{if(fixture)await new Promise(r=>fixture.close(r));await fs.rm(directory,{recursive:true,force:true});}
 }
})().catch(()=>{process.exitCode=1;});
