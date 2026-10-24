'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');
const { buildConfig } = require('./config.cjs');
const { AppError } = require('./errors.cjs');
const { lockDirectory } = require('./vault.cjs');
const { inspectNetwork,prepareTransportProfile } = require('./network.cjs');
const HEALTH_TARGETS=Object.freeze([
  {name:'cloudflare-ipv4',url:'https://1.1.1.1/cdn-cgi/trace'},
  {name:'google-204',url:'https://www.gstatic.com/generate_204'}
]);
const pause = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
  const server = net.createServer(); await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}
function scrub(line, secrets = []) {
  let s = String(line).replace(/\x1b\[[0-9;]*m/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
  for (const secret of [...secrets].filter(s=>typeof s==='string'&&s.length>0).sort((a,b)=>b.length-a.length)) s=s.split(secret).join('[redacted]');
  return s.replace(/(?:[A-Za-z0-9+/]{40,}={0,2})/g,'[redacted]').slice(-4000);
}
function profileSecrets(value,key='',result=[]) {
  if(typeof value==='string' && /private|password|username|uuid|secret|token|certificate|client_key|pre_shared|public_key/i.test(key)) {
    result.push(value);
    if(value.includes('\n'))result.push(...value.split(/\r?\n/).filter(s=>s && !s.startsWith('-----')));
  } else if(Array.isArray(value))for(const item of value)profileSecrets(item,key,result);
  else if(value && typeof value==='object')for(const [k,v]of Object.entries(value))profileSecrets(v,k,result);
  return result;
}
class Engine extends EventEmitter {
  constructor(coreDirectory, runtimeDirectory, services = {}) {
    super(); this.spawn=services.spawn||spawn; this.request=services.fetch||fetch; this.pause=services.pause||pause; this.networkLock=services.networkLock;
    this.inspectNetwork=services.inspectNetwork||inspectNetwork;this.lookup=services.lookup;
    this.healthTargets=services.healthTargets||HEALTH_TARGETS;
    this.coreDirectory = coreDirectory; this.runtimeDirectory = runtimeDirectory;
    this.state = { status: 'disconnected', upload: 0, download: 0, latency: null, startedAt: null }; this.stopping = false; this.busy = false;
  }
  update(changes) { Object.assign(this.state,changes); this.emit('state',{...this.state}); }
  async initialize() { await lockDirectory(this.runtimeDirectory); await this.clean(); }
  async clean() { for (const n of await fs.readdir(this.runtimeDirectory)) if (/^(session-[a-f0-9]+\.json|lock-[a-f0-9]+\.policy)$/.test(n)) await fs.unlink(path.join(this.runtimeDirectory,n)).catch(()=>{}); }
  async verifyCore() {
    const executable = path.join(this.coreDirectory, process.platform === 'win32' ? 'sing-box.exe' : 'sing-box');
    let meta, bytes; try { meta = JSON.parse(await fs.readFile(path.join(this.coreDirectory,'integrity.json'),'utf8')); bytes = await fs.readFile(executable); } catch { throw new AppError('coreMissing'); }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== meta.sha256) throw new AppError('coreIntegrity');
    if(process.platform==='win32') {
      this.guardian = path.join(this.coreDirectory,'guardian.exe');
      const guardianBytes=await fs.readFile(this.guardian).catch(()=>{throw new AppError('coreMissing');});
      if(!meta.guardianSha256 || crypto.createHash('sha256').update(guardianBytes).digest('hex')!==meta.guardianSha256)throw new AppError('coreIntegrity');
    }
    this.executable = executable; return meta.version;
  }
  async api(route, timeout = 3000) {
    const response = await this.request(`http://127.0.0.1:${this.controller.port}${route}`, { headers: { Authorization: `Bearer ${this.controller.secret}` }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error('engine-api HTTP '+response.status); return response.json();
  }
  async connect(profile,options) {
    if(this.busy||this.child)throw new AppError('connectionBusy');
    this.busy=true;this.stopping=false;
    this.update({status:'connecting',upload:0,download:0,latency:null,startedAt:null,error:null,detail:null,profileId:profile.id});
    let stage='integrity',secrets=profileSecrets(profile),lastError='',termination='';
    const capture=b=>{lastError=scrub(lastError+String(b),secrets);};
    const detail=e=>scrub('stage='+stage+'\n'+(termination?termination+'\n':'')+(e?.message&&e.message!==e.code?e.message+'\n':'')+lastError,secrets);
    try {
      await this.verifyCore();
      this.controller={port:await freePort(),secret:crypto.randomBytes(32).toString('hex')};
      stage='bootstrap';
      const network=await this.inspectNetwork();
      const prepared=await prepareTransportProfile(profile,this.lookup);
      const config=buildConfig(prepared,{...options,nativeIPv6:network.ipv6},this.controller);
      this.update({ipv4Compatibility:network.ipv6===false});
      this.configFile=path.join(this.runtimeDirectory,'session-'+crypto.randomBytes(16).toString('hex')+'.json');
      secrets.push(this.controller.secret,this.configFile,os.homedir());
      stage='configuration';await fs.writeFile(this.configFile,JSON.stringify(config),{mode:0o600,flag:'wx'});
      const check=this.spawn(this.executable,['check','-c',this.configFile],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      check.stdout?.on('data',capture);check.stderr.on('data',capture);
      const exit=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{check.kill();reject(new AppError('engineTimeout'));},15000);
        check.once('error',e=>{clearTimeout(timer);reject(new AppError('coreFailed','spawn='+e.code));});
        check.once('close',code=>{clearTimeout(timer);resolve(code);});
      });
      if(exit!==0)throw new AppError('coreConfig','check-exit='+exit);
      lastError='';
      if(options.killSwitch) {
        stage='network-lock';
        if(!this.networkLock)throw new AppError('killSwitchFailed');
        await this.networkLock.arm(options);this.emit('network-lock');
      }
      stage='startup';
      const child=this.child=this.spawn(process.platform==='win32'?this.guardian:this.executable,
        process.platform==='win32'?[this.executable,this.configFile]:['run','-c',this.configFile],
        {windowsHide:true,stdio:['pipe','pipe','pipe']});
      let ended=false;
      child.stdout.on('data',capture);child.stderr.on('data',capture);
      child.stdin.on('error',()=>{});
      child.once('error',e=>{ended=true;termination='spawn='+e.code;});
      child.once('close',(code,signal)=>{
        ended=true;termination=termination||'exit='+code+(signal?'; signal='+signal:'');
        if(this.child===child)this.child=null;
        clearInterval(this.poll);
        if(!this.stopping) {
          this.update({status:'error',error:'coreFailed',detail:detail(),latency:null,startedAt:null});
          if(!this.busy)this.clean().catch(()=>{});
        }
      });
      let ready=false;
      for(let i=0;i<60;i++) {
        if(ended)break;
        try { await this.api('/version',500);ready=true;break; } catch {}
        await this.pause(250);
      }
      if(!ready||ended)throw new AppError('coreFailed',ended?'':'controller readiness timed out');
      if(options.killSwitch) {
        stage='network-lock';await this.networkLock.arm(options);this.emit('network-lock');
      }
      stage='probe';
      let health;const failures=[];
      for(const target of this.healthTargets) {
        if(ended)throw new AppError('coreFailed');
        try {
          const result=await this.api('/proxies/vpn/delay?timeout=8000&url='+encodeURIComponent(target.url),10000);
          if(ended||this.child!==child)throw new AppError('coreFailed');
          if(!Number.isFinite(result?.delay)||result.delay<0)throw Error('VPN probe returned no delay');
          health=result;break;
        }catch(e){if(ended)throw new AppError('coreFailed');failures.push(target.name+': '+e.message);}
      }
      if(!health)throw new AppError('healthFailed',failures.join('\n'));
      if(ended||this.child!==child)throw new AppError('coreFailed');
      if(!health||!Number.isFinite(health.delay))throw new AppError('healthFailed','VPN probe returned no delay');
      stage='running';this.update({status:'connected',latency:health.delay,startedAt:Date.now(),detail:null});
      this.poll=setInterval(async()=>{
        if(this.pollBusy||!this.child)return;
        this.pollBusy=true;
        try { const d=await this.api('/connections');if(this.child===child)this.update({upload:d.uploadTotal||0,download:d.downloadTotal||0}); }
        catch {} finally { this.pollBusy=false; }
      },1500);
    } catch(e) {
      const error=e instanceof AppError?e:new AppError('coreFailed',e.code?'system='+e.code:'Engine operation failed');
      const diagnostic=detail(error);await this.stop(false);
      this.update({status:'error',error:error.code,detail:diagnostic,latency:null,startedAt:null});
      throw new AppError(error.code,diagnostic);
    } finally { this.busy=false; }
    return {...this.state};
  }
  async stop(reset = true) {
    this.stopping = true; clearInterval(this.poll);
    const child = this.child;
    if (child) {
      // Closing stdin stops the guardian on Windows, which first sends a
      // console CTRL_BREAK to sing-box for orderly adapter/route cleanup.
      if(process.platform==='win32')child.stdin.end('stop');else child.kill('SIGINT');
      await Promise.race([new Promise(r=>child.once('close',r)),pause(5500)]);
      if (this.child === child) { child.kill('SIGKILL'); await Promise.race([new Promise(r=>child.once('close',r)),pause(1000)]); }
      this.child = null;
    }
    await this.clean();
    if(reset) this.update({ status:'disconnected',error:null,detail:null,latency:null,startedAt:null });
  }
}
module.exports = { Engine, scrub, freePort, profileSecrets };
