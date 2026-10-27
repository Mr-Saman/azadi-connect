'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {AppError}=require('./errors.cjs');
const API='https://api.github.com/repos/Mr-Saman/azadi-connect/releases/latest';
function version(value){if(!/^\d+\.\d+\.\d+$/.test(value))throw new AppError('updateInvalid');return value.split('.').map(Number);}
function newer(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function releaseInfo(release,current){
 if(release.draft||release.prerelease||typeof release.tag_name!=='string')throw new AppError('updateInvalid');
 const v=release.tag_name.replace(/^v/,'');if(!newer(v,current))return null;
 const name='Azadi-Connect-'+v+'-Windows-x64-Setup.exe';
 const asset=release.assets?.find(a=>a.name===name),sums=release.assets?.find(a=>a.name==='SHA256SUMS.txt');
 const prefix='https://github.com/Mr-Saman/azadi-connect/releases/download/v'+v+'/';
 for(const a of [asset,sums])if(!a||a.browser_download_url!==prefix+a.name||!Number.isSafeInteger(a.size)||a.size<=0)throw new AppError('updateInvalid');
 if(asset.size>512*1024*1024||sums.size>65536)throw new AppError('updateInvalid');
 return {version:v,asset,sums};
}
function checksum(text,name){
 const matches=text.split(/\r?\n/).map(line=>line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)).filter(m=>m&&m[2]===name);
 if(matches.length!==1)throw new AppError('updateInvalid');return matches[0][1].toLowerCase();
}
class Updater{
 constructor(current,directory,request,notify=()=>{}){this.current=current;this.directory=directory;this.request=request;this.notify=notify;this.state={status:'idle'};}
 update(changes){Object.assign(this.state,changes);this.notify();}
 async response(url){const r=await this.request(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(180000)});if(!r.ok)throw new AppError('updateFailed');return r;}
 async run(action){
 if(this.busy)throw new AppError('updateBusy');this.busy=true;
 try{
 if(action==='check'){
 this.update({status:'checking',error:null});
 const r=await this.response(API);const text=await r.text();if(text.length>2*1024*1024)throw new AppError('updateInvalid');
 this.release=releaseInfo(JSON.parse(text),this.current);this.file=null;
 this.update({status:this.release?'available':'current',version:this.release?.version,progress:0});return;
 }
 if(action!=='download'||!this.release)throw new AppError('updateInvalid');
 this.update({status:'downloading',error:null,progress:0});const {asset,sums}=this.release;
 const sumResponse=await this.response(sums.browser_download_url),sumText=await sumResponse.text();
 if(Buffer.byteLength(sumText)>65536)throw new AppError('updateInvalid');
 const expected=checksum(sumText,asset.name);
 await fs.mkdir(this.directory,{recursive:true,mode:0o700});
 const target=path.join(this.directory,asset.name),temporary=target+'.partial';
 await fs.rm(temporary,{force:true});
 try{
 const response=await this.response(asset.browser_download_url),hash=crypto.createHash('sha256');
 const handle=await fs.open(temporary,'wx',0o600);let size=0;
 try{for await(const chunk of response.body){size+=chunk.length;if(size>asset.size)throw new AppError('updateInvalid');hash.update(chunk);await handle.writeFile(chunk);this.update({progress:Math.floor(size/asset.size*100)});}}finally{await handle.close();}
 if(size!==asset.size||hash.digest('hex')!==expected)throw new AppError('updateIntegrity');
 await fs.rename(temporary,target);this.file=target;this.expected=expected;this.update({status:'ready',progress:100});
 }finally{await fs.rm(temporary,{force:true});}
 }catch(e){this.update({status:'error',error:e instanceof AppError?e.code:'updateFailed'});throw new AppError(this.state.error);}
 finally{this.busy=false;}
 }
 async verifiedFile(){if(this.state.status!=='ready'||!this.file)throw new AppError('updateInvalid');const hash=crypto.createHash('sha256').update(await fs.readFile(this.file)).digest('hex');if(hash!==this.expected)throw new AppError('updateIntegrity');return this.file;}
}
module.exports={Updater,newer,releaseInfo,checksum};
