'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {freePort}=require('../app/lib/engine.cjs');
if(process.platform!=='win32'){console.log('Guardian lifecycle smoke test requires Windows.');process.exit(0);}
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-guardian-'));
 try{
  for(const mode of ['graceful','guardian-crash']){
   const port=await freePort();const token='test-only-guardian-smoke';
   const filename=path.join(directory,'local-only.json');
   const testKey=Buffer.alloc(32,1).toString('base64');
   await fs.writeFile(filename,JSON.stringify({log:{level:'error'},outbounds:[{type:'direct',tag:'direct'}],endpoints:[{type:'wireguard',tag:'vpn',system:false,address:['10.254.254.2/32'],private_key:testKey,peers:[{address:'127.0.0.1',port:9,public_key:testKey,allowed_ips:['0.0.0.0/0']}]}],experimental:{clash_api:{external_controller:`127.0.0.1:${port}`,secret:token}}}));
   // No TUN, DNS mutation or provider is used: this only tests child lifecycle.
   const child=spawn(path.join(root,'resources/core/guardian.exe'),[path.join(root,'resources/core/sing-box.exe'),filename],{stdio:['pipe','ignore','pipe'],windowsHide:true});
   let logs='';child.stderr.on('data',b=>logs+=b);
   const up=async()=>{try{const r=await fetch(`http://127.0.0.1:${port}/version`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(500)});return r.ok;}catch{return false;}};
   try{
    let ready=false;for(let i=0;i<60;i++){if(await up()){ready=true;break;}await pause(150);}assert.ok(ready,'Managed child did not start: '+logs);
    const proxies=await fetch(`http://127.0.0.1:${port}/proxies`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
    assert.ok(proxies.proxies?.vpn,'WireGuard endpoint is missing from the control API used by connectivity checks');
    if(mode==='graceful')child.stdin.end('stop');else child.kill('SIGKILL');
    let stopped=false;for(let i=0;i<80;i++){if(!await up()){stopped=true;break;}await pause(100);}assert.ok(stopped,'Managed child survived '+mode);
    console.log('PASS native guardian '+mode);
   }finally{if(child.exitCode===null)child.kill('SIGKILL');}
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exit(1);});
