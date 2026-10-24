'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {AppError}=require('./errors.cjs');
const {normalizeApp}=require('./config.cjs');
const exec=promisify(execFile);
function encodePolicy(mode,apps=[]) {
  if(!['apps','system'].includes(mode))throw new AppError('invalidMode');
  if(mode==='apps'&&!apps.length)throw new AppError('selectApps');
  if(apps.length>500)throw new AppError('invalidApp');
  const paths=mode==='apps'?[...new Set(apps.map(normalizeApp))]:[];
  const header=Buffer.alloc(16);header.write('AZADIKS1');header.writeUInt32LE(mode==='system'?1:2,8);header.writeUInt32LE(paths.length,12);
  return Buffer.concat([header,...paths.flatMap(filename=>{
    const bytes=Buffer.from(filename,'utf16le'),size=Buffer.alloc(4);size.writeUInt32LE(bytes.length/2);return [size,bytes];
  })]);
}
class NetworkLock {
  constructor(directory,runtimeDirectory) {
    this.directory=directory;this.runtimeDirectory=runtimeDirectory;
    this.state={active:false,mode:null,filters:0,complete:true};
  }
  async invoke(command,extra=[]) {
    if(process.platform!=='win32')throw new AppError('windowsOnly');
    const file=path.join(this.directory,'network-lock.exe');
    let meta,bytes;
    try {meta=JSON.parse(await fs.readFile(path.join(this.directory,'integrity.json'),'utf8'));bytes=await fs.readFile(file);}
    catch {throw new AppError('coreMissing');}
    if(!meta.networkLockSha256||crypto.createHash('sha256').update(bytes).digest('hex')!==meta.networkLockSha256)throw new AppError('coreIntegrity');
    try {
      const result=await exec(file,[command,...extra],{windowsHide:true,timeout:20000,maxBuffer:65536});
      return JSON.parse(result.stdout);
    } catch(e) {
      const detail=String(e.stderr||'network-lock: unavailable').replace(/[^\x20-\x7e\n]/g,'').slice(-1000);
      throw new AppError('killSwitchFailed',detail);
    }
  }
  async refresh() {
    if(process.platform!=='win32')return this.state;
    this.state=await this.invoke('status');return this.state;
  }
  async arm(options) {
    const filename=path.join(this.runtimeDirectory,'lock-'+crypto.randomBytes(16).toString('hex')+'.policy');
    try {
      await fs.writeFile(filename,encodePolicy(options.mode,options.apps),{mode:0o600,flag:'wx'});
      await this.invoke('arm',[filename]);await this.refresh();
      if(!this.state.active||!this.state.complete)throw new AppError('killSwitchFailed','network-lock: incomplete policy');
      return this.state;
    } finally {await fs.unlink(filename).catch(()=>{});}
  }
  async refreshForStartup(options) {
    await this.refresh();
    // Atomically replace old app policies (including their global DNS block)
    // with this version's exact app scope. Never briefly unlock the apps.
    if(this.state.active && this.state.mode==='apps') {
      if(options.mode!=='apps')throw new AppError('killSwitchFailed');
      await this.arm({mode:'apps',apps:options.apps});
    }
    return this.state;
  }
  async unlock() {await this.invoke('unlock');return await this.refresh();}
}
module.exports={NetworkLock,encodePolicy};
