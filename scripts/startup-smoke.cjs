'use strict';
// Execute the production DNS configuration: `sing-box check` alone does not
// initialize DNS transports and missed the invalid bootstrap direct detour.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {importProfiles}=require('../app/lib/importers.cjs');
const {buildConfig}=require('../app/lib/config.cjs');
const {freePort}=require('../app/lib/engine.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-startup-'));
 const executable=process.env.AZADI_TEST_CORE || path.join(__dirname,'../resources/core',process.platform==='win32'?'sing-box.exe':'sing-box');
 const key=Buffer.alloc(32,1).toString('base64');
 try{
  for(const dns of ['', 'DNS=10.254.254.1'])for(const mode of ['apps','system']){
   const profile=importProfiles(`[Interface]\nPrivateKey=${key}\nAddress=10.254.254.2/32\n${dns}\n[Peer]\nPublicKey=${key}\nEndpoint=127.0.0.1:9\nAllowedIPs=0.0.0.0/0,::/0`)[0];
   const port=await freePort(),secret='synthetic-startup-test-only';
   const config=buildConfig(profile,{mode,apps:['C:\\Example\\example.exe']},{port,secret});
   // Preserve every production DNS server, detour and routing rule. Only omit
   // the privileged TUN device and interface binding; no host routes or system
   // DNS are changed. Windows TUN traffic is tested separately by CI.
   config.inbounds=[];config.route.auto_detect_interface=false;config.log.level='info';
   const filename=path.join(directory,'startup.json');await fs.writeFile(filename,JSON.stringify(config));
   const child=spawn(executable,['run','-c',filename],{stdio:['ignore','pipe','pipe'],windowsHide:true});
   let logs='',failure;child.on('error',e=>{failure=e;});
   const closed=once(child,'close');
   const collect=b=>{logs=(logs+b.toString()).slice(-16000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
   try{
    let ready=false;
    for(let i=0;i<80;i++){
     if(failure||child.exitCode!==null)break;
     if(logs.includes('sing-box started')){ready=true;break;}
     await pause(100);
    }
    assert.ok(ready,'Generated configuration failed at runtime: '+(failure?.message||logs));
    const response=await fetch(`http://127.0.0.1:${port}/proxies`,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(2000)});
    assert.ok(response.ok);assert.ok((await response.json()).proxies?.vpn);
    assert.doesNotMatch(logs,/FATAL|deprecated|empty direct outbound/i);
    console.log(`PASS generated startup and DNS · ${mode} · ${dns?'profile DNS':'TLS DNS'}`);
   }finally{
    if(child.exitCode===null)child.kill();
    const timer=setTimeout(()=>child.kill('SIGKILL'),2000);
    try{await closed;}finally{clearTimeout(timer);}
   }
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
