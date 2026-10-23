'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { buildConfig } = require('./config.cjs');
const { AppError } = require('./errors.cjs');
const { lockDirectory } = require('./vault.cjs');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
  const server = net.createServer(); await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}
function scrub(line, secrets = []) {
  let s = String(line).replace(/\x1b\[[0-9;]*m/g,'').slice(0,1200);
  for (const secret of secrets) if (typeof secret === 'string' && secret.length > 3) s = s.split(secret).join('[redacted]');
  return s.replace(/(?:[A-Za-z0-9+/]{40,}={0,2})/g,'[redacted]');
}
class Engine extends EventEmitter {
  constructor(coreDirectory, runtimeDirectory) {
    super(); this.coreDirectory = coreDirectory; this.runtimeDirectory = runtimeDirectory;
    this.state = { status: 'disconnected', upload: 0, download: 0, latency: null, startedAt: null }; this.stopping = false; this.busy = false;
  }
  update(changes) { Object.assign(this.state,changes); this.emit('state',{...this.state}); }
  async initialize() { await lockDirectory(this.runtimeDirectory); await this.clean(); }
  async clean() { for (const n of await fs.readdir(this.runtimeDirectory)) if (/^session-[a-f0-9]+\.json$/.test(n)) await fs.unlink(path.join(this.runtimeDirectory,n)).catch(()=>{}); }
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
    const response = await fetch(`http://127.0.0.1:${this.controller.port}${route}`, { headers: { Authorization: `Bearer ${this.controller.secret}` }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error('engine-api'); return response.json();
  }
  async connect(profile, options) {
    if (this.busy || this.child) throw new AppError('connectionBusy');
    this.busy = true; this.stopping = false;
    this.update({ status: 'connecting', upload: 0, download: 0, latency: null, error: null, detail: null, profileId: profile.id });
    try {
      await this.verifyCore();
      this.controller = { port: await freePort(), secret: crypto.randomBytes(32).toString('hex') };
      const config = buildConfig(profile, options, this.controller);
      this.configFile = path.join(this.runtimeDirectory,`session-${crypto.randomBytes(16).toString('hex')}.json`);
      await fs.writeFile(this.configFile,JSON.stringify(config),{ mode: 0o600, flag: 'wx' });
      const secrets = [profile.endpoint.private_key,profile.endpoint.password,profile.endpoint.uuid,this.controller.secret,
        ...((profile.endpoint.peers || []).flatMap(p => [p.pre_shared_key,p.public_key]))];
      const check = spawn(this.executable,['check','-c',this.configFile],{ windowsHide: true, stdio: ['ignore','ignore','pipe'] });
      let checkError = ''; check.stderr.on('data',b => { checkError = (checkError + scrub(b,secrets)).slice(-3000); });
      const exit = await new Promise((resolve,reject) => { const timer = setTimeout(()=>{check.kill();reject(new AppError('engineTimeout'));},15000); check.once('error',e=>{clearTimeout(timer);reject(e);}); check.once('exit',code=>{clearTimeout(timer);resolve(code);}); });
      if (exit !== 0) throw new AppError('coreConfig', checkError);
      const child = this.child = spawn(process.platform==='win32'?this.guardian:this.executable,process.platform==='win32'?[this.executable,this.configFile]:['run','-c',this.configFile],{ windowsHide: true, stdio: ['pipe','ignore','pipe'] });
      let lastError = ''; child.stderr.on('data',b => { lastError = (lastError + scrub(b,secrets)).slice(-3000); });
      child.once('error',() => this.update({ status: 'error', error: 'coreFailed' }));
      child.once('exit',() => {
        if (this.child === child) this.child = null;
        clearInterval(this.poll);
        if (!this.stopping) this.update({ status: 'error', error: 'coreFailed', detail: lastError });
        this.clean().catch(()=>{});
      });
      let ready = false;
      for (let i = 0; i < 60; i++) { if (this.child !== child) break; try { await this.api('/version',500); ready = true; break; } catch {} await pause(250); }
      if (!ready) throw new AppError('coreFailed',lastError);
      // A running process is not proof that the VPN works. Delay probes are
      // issued directly against the VPN outbound, independent of process rules.
      const health = await this.api('/proxies/vpn/delay?timeout=12000&url=https%3A%2F%2Fwww.gstatic.com%2Fgenerate_204',14000).catch(()=>null);
      if (!health || !Number.isFinite(health.delay)) throw new AppError('healthFailed');
      this.update({ status: 'connected', latency: health.delay, startedAt: Date.now(), detail: null });
      this.poll = setInterval(async()=>{ if(this.pollBusy || !this.child) return; this.pollBusy=true; try { const d=await this.api('/connections'); this.update({ upload: d.uploadTotal || 0, download: d.downloadTotal || 0 }); } catch {} finally { this.pollBusy=false; } },1500);
    } catch (e) {
      await this.stop(false); this.update({ status: 'error', error: e.code || 'coreFailed', detail: scrub(e.message) }); throw e;
    } finally { this.busy = false; }
    return { ...this.state };
  }
  async stop(reset = true) {
    this.stopping = true; clearInterval(this.poll);
    const child = this.child;
    if (child) {
      // Closing stdin stops the guardian on Windows, which first sends a
      // console CTRL_BREAK to sing-box for orderly adapter/route cleanup.
      if(process.platform==='win32')child.stdin.end('stop');else child.kill('SIGINT');
      await Promise.race([new Promise(r=>child.once('exit',r)),pause(5500)]);
      if (this.child === child) { child.kill('SIGKILL'); await Promise.race([new Promise(r=>child.once('exit',r)),pause(1000)]); }
      this.child = null;
    }
    await this.clean();
    if(reset) this.update({ status:'disconnected',error:null,detail:null,latency:null,startedAt:null });
  }
}
module.exports = { Engine, scrub, freePort };
