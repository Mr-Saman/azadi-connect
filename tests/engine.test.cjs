'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Engine,profileSecrets,scrub}=require('../app/lib/engine.cjs');
const {NetworkLock,encodePolicy}=require('../app/lib/network-lock.cjs');
const {prepareTransportProfile}=require('../app/lib/network.cjs');
const profile={id:'test',endpoint:{type:'socks',server:'example.invalid',server_port:1080,password:'secret-test-123'}};
function processFixture() {
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
 child.kill=()=>{setImmediate(()=>child.emit('close',0,null));};return child;
}
async function fixture(t,{onRun=()=>{},fetch}={}) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-engine-test-'));
 let child;
 const lock={calls:0,async arm(){this.calls++;}};
 const engine=new Engine(directory,directory,{networkLock:lock,spawn:(_,args)=>{
   const p=processFixture();
   if(args[0]==='check')setImmediate(()=>p.emit('close',0,null));
   else {child=p;setImmediate(()=>onRun(p));}return p;
 },fetch:fetch|| (async()=>({ok:true,json:async()=>({delay:12})})),pause:()=>new Promise(r=>setImmediate(r))});
 engine.verifyCore=async()=>{engine.executable='fixture';};
 t.after(async()=>{await engine.stop();await fs.rm(directory,{recursive:true,force:true});});
 return {engine,lock,child:()=>child};
}
test('startup failure preserves the stage, exit code and sanitized engine output',async t=>{
 const {engine}=await fixture(t,{onRun:p=>{p.stderr.write('FATAL TUN unavailable secret-test-123');p.emit('close',23,null);},fetch:async()=>{throw Error('not ready');}});
 await assert.rejects(engine.connect(profile,{mode:'system'}),{code:'coreFailed'});
 assert.equal(engine.state.status,'error');assert.match(engine.state.detail,/stage=startup/);
 assert.match(engine.state.detail,/exit=23/);assert.match(engine.state.detail,/TUN unavailable/);
 assert.ok(!engine.state.detail.includes('secret-test-123'));
});
test('engine exit during a successful probe must never become connected',async t=>{
 let fixtureChild;
 const {engine}=await fixture(t,{onRun:p=>{fixtureChild=p;},fetch:async url=>{
   if(url.includes('/delay')) {await new Promise(r=>setImmediate(r));fixtureChild.emit('close',9,null);}
   return {ok:true,json:async()=>({delay:1})};
 }});
 const statuses=[];engine.on('state',s=>statuses.push(s.status));
 await assert.rejects(engine.connect(profile,{mode:'system'}),{code:'coreFailed'});
 assert.ok(!statuses.includes('connected'));assert.match(engine.state.detail,/exit=9/);
});
test('a failed VPN probe keeps an already armed network lock and reports its own error',async t=>{
 const {engine,lock}=await fixture(t,{fetch:async url=>({ok:!url.includes('/delay'),status:504,json:async()=>({})})});
 await assert.rejects(engine.connect(profile,{mode:'system',killSwitch:true}),{code:'healthFailed'});
 assert.equal(lock.calls,2);assert.equal(engine.child,null);
 assert.match(engine.state.detail,/stage=probe/);assert.match(engine.state.detail,/504/);
});
test('an unavailable probe target falls back through the VPN and needs a real valid delay',async t=>{
 const probes=[];
 const {engine}=await fixture(t,{fetch:async url=>{
   if(!url.includes('/delay'))return {ok:true,json:async()=>({})};
   probes.push(url);
   return probes.length===1?{ok:false,status:504}:{ok:true,json:async()=>({delay:18})};
 }});
 await engine.connect(profile,{mode:'system'});
 assert.equal(engine.state.status,'connected');assert.equal(engine.state.latency,18);
 assert.equal(probes.length,2);assert.ok(probes.every(url=>url.includes('/proxies/vpn/delay')));
 assert.match(decodeURIComponent(probes[0]),/https:\/\/1\.1\.1\.1\//);
});
test('invalid delay values from every target cannot become a connected VPN',async t=>{
 const {engine}=await fixture(t,{fetch:async url=>({ok:true,json:async()=>url.includes('/delay')?{delay:-1}:{}})});
 await assert.rejects(engine.connect(profile,{mode:'system'}),{code:'healthFailed'});
 assert.equal(engine.state.status,'error');assert.equal(engine.child,null);
});
test('WireGuard bootstrap prefers IPv4 and never changes the saved profile',async()=>{
 const p={endpoint:{type:'wireguard',peers:[{address:'vpn.example',allowed_ips:['0.0.0.0/0','::/0']}]}};
 const result=await prepareTransportProfile(p,async()=>[{address:'2001:db8::1',family:6},{address:'192.0.2.1',family:4}]);
 assert.equal(result.endpoint.peers[0].address,'192.0.2.1');assert.equal(p.endpoint.peers[0].address,'vpn.example');
 assert.deepEqual(result.endpoint.peers[0].allowed_ips,['0.0.0.0/0','::/0']);
 const ipv6=await prepareTransportProfile(p,async()=>[{address:'2001:db8::1',family:6}]);
 assert.equal(ipv6.endpoint.peers[0].address,'2001:db8::1');
 await assert.rejects(prepareTransportProfile(p,async()=>{throw Error('DNS unavailable');}),{code:'bootstrapFailed'});
});
test('redaction covers nested credentials and certificate body lines',()=>{
 const credentials={password:'abc',nested:{uuid:'test-uuid',client_key:['-----BEGIN KEY-----\nline-of-secret\n-----END KEY-----']}};
 const output=scrub('abc test-uuid line-of-secret',profileSecrets(credentials));
 assert.ok(!output.includes('abc'));assert.ok(!output.includes('test-uuid'));assert.ok(!output.includes('line-of-secret'));
});
test('network policy accepts Unicode executable paths and rejects invalid or empty scope',()=>{
 const p=encodePolicy('apps',['C:\\آزادی\\browser.exe']);
 assert.equal(p.subarray(0,8).toString(),'AZADIKS1');assert.equal(p.readUInt32LE(8),2);
 assert.equal(p.readUInt32LE(12),1);assert.equal(p.subarray(20).toString('utf16le'),'C:\\آزادی\\browser.exe');
 assert.throws(()=>encodePolicy('apps',[]),{code:'selectApps'});
 assert.throws(()=>encodePolicy('apps',['\\\\host\\bad.exe']),{code:'invalidApp'});
 assert.equal(encodePolicy('system').length,16);
});
test('startup migrates an existing app policy atomically without unlocking it',async()=>{
 const lock=new NetworkLock('unused','unused'),calls=[];
 lock.refresh=async()=>{lock.state={active:true,mode:'apps',complete:true};return lock.state;};
 lock.arm=async options=>{calls.push(options);return lock.state;};
 lock.unlock=async()=>assert.fail('Migration must not unlock');
 await lock.refreshForStartup({mode:'apps',apps:['C:\\Apps\\selected.exe']});
 assert.deepEqual(calls,[{mode:'apps',apps:['C:\\Apps\\selected.exe']}]);
});
test('startup leaves inactive and system-wide policies untouched',async()=>{
 for(const state of [{active:false},{active:true,mode:'system'}]){
  const lock=new NetworkLock('unused','unused');lock.refresh=async()=>{lock.state=state;return state;};
  lock.arm=async()=>assert.fail('Unexpected policy replacement');
  assert.equal(await lock.refreshForStartup({mode:'apps',apps:[]}),state);
 }
});
test('scope mismatch does not silently release an existing app policy',async()=>{
 const lock=new NetworkLock('unused','unused');lock.refresh=async()=>{lock.state={active:true,mode:'apps'};};
 lock.arm=async()=>assert.fail('Unexpected scope change');
 await assert.rejects(lock.refreshForStartup({mode:'system',apps:[]}),{code:'killSwitchFailed'});
 assert.equal(lock.state.active,true);
});
