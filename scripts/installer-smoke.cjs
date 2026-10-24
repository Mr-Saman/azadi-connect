'use strict';
// Installs and repairs only on a disposable GitHub Windows VM. Never a desktop.
const fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {encodePolicy}=require('../app/lib/network-lock.cjs');
if(process.platform!=='win32'||!process.env.GITHUB_ACTIONS||!process.env.RUNNER_TEMP)throw Error('Disposable Windows GitHub runner required');
const exec=promisify(execFile),root=path.resolve(__dirname,'..');
const version=require('../package.json').version,pause=ms=>new Promise(r=>setTimeout(r,ms));
// Exercise the actual supported per-machine installation destination.
const install=path.join(process.env.ProgramFiles,'Azadi Connect');
const installer=path.join(root,'dist',`Azadi-Connect-${version}-Windows-x64-Setup.exe`);
const application=path.join(install,'Azadi Connect.exe'),helper=path.join(install,'resources/core/network-lock.exe');
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps=async script=>(await exec(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{timeout:20000,windowsHide:true})).stdout.trim();
const invoke=async(...args)=>JSON.parse((await exec(helper,args,{timeout:20000,windowsHide:true})).stdout);
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
const marker=path.join(process.env.APPDATA,'Azadi Connect/private/upgrade-test-marker.txt');
let child,ownsPolicy=false,appLogs='';
async function installAgain() {
 // NSIS requires /D to be the final unquoted switch, including paths with spaces.
 await exec(installer,['/S','/D='+install],{timeout:120000,windowsVerbatimArguments:true,windowsHide:true});
 assert.ok(await exists(application),'Installer did not create the application');
}
async function stopApp() {
 if(!child||child.exitCode!==null||child.signalCode)return;
 await exec(application,['--quit-for-update'],{timeout:20000,windowsHide:true}).catch(()=>{});
 for(let i=0;i<80&&child.exitCode===null&&!child.signalCode;i++)await pause(100);
 if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');
}
(async()=>{
 assert.equal(await exists(install),false,'Refuse to overwrite an existing test directory');
 await fs.mkdir(path.dirname(marker),{recursive:true});await fs.writeFile(marker,'user-profile-marker-do-not-remove');
 try{
  await installAgain();assert.equal((await invoke('status')).active,false);ownsPolicy=true;
  assert.equal(await fs.readFile(marker,'utf8'),'user-profile-marker-do-not-remove');
  const info=JSON.parse(await ps("$shell=New-Object -ComObject Shell.Application; $dir=Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Azadi Connect'; $folder=$shell.Namespace($dir); $item=$folder.ParseName('Azadi Connect.lnk'); [pscustomobject]@{AppId=$item.ExtendedProperty('System.AppUserModel.ID');Version=(Get-Item "+quote(application)+").VersionInfo.ProductVersion;Location=(Get-ItemProperty 'HKLM:\\Software\\AzadiConnect').InstallDir} | ConvertTo-Json -Compress"));
  assert.equal(info.AppId,'org.azadi.connect');assert.ok(info.Version.startsWith(version));assert.equal(info.Location.toLowerCase(),install.toLowerCase());
  console.log('PASS real installer: version, directory, pinnable Start shortcut AppUserModelID and profile preservation');
  await fs.writeFile(path.join(install,'user-notes.txt'),'unrelated-file');
  const policy=path.join(process.env.RUNNER_TEMP,'azadi-installer.policy');
  await fs.writeFile(policy,encodePolicy('apps',[path.join(root,'test-output/network-probe.exe')]));await invoke('arm',policy);
  const before=await invoke('status');assert.equal(before.active,true);
  // No provider credentials and no connection requested.
  child=spawn(application,['--disable-gpu','--enable-logging=stderr'],{stdio:['ignore','pipe','pipe'],windowsHide:false});let error;child.on('error',e=>{error=e;});
  const collect=b=>{appLogs=(appLogs+b.toString()).slice(-16000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
  let visible=false;
  for(let i=0;i<30;i++){
   if(error||child.exitCode!==null)break;
   const value=await ps("@(Get-Process | Where-Object { $_.Path -eq "+quote(application)+" -and $_.MainWindowTitle -eq 'Azadi Connect' }).Count");
   if(Number(value)>0){visible=true;break;}await pause(300);
  }
  assert.ok(visible,'Installed application did not create its window: '+(error?.message||child.exitCode)+'\n'+appLogs);
  await installAgain();
  for(let i=0;i<30&&child.exitCode===null&&!child.signalCode;i++)await pause(100);
  assert.ok(child.exitCode!==null||child.signalCode,'Repair did not close the previous app instance');
  assert.deepEqual(await invoke('status'),before,'Repair altered the active protection policy');
  assert.equal(await fs.readFile(marker,'utf8'),'user-profile-marker-do-not-remove');
  assert.equal(await fs.readFile(path.join(install,'user-notes.txt'),'utf8'),'unrelated-file');
  console.log('PASS reinstall over a running app: cooperative shutdown, helper replacement and existing data/policy preservation');
  await exec(path.join(install,'Uninstall.exe'),['/S'],{timeout:60000,windowsHide:true});
  for(let i=0;i<100&&await exists(application);i++)await pause(100);
  assert.equal(await exists(application),false,'Uninstaller did not remove the application');ownsPolicy=false;
  assert.equal(await fs.readFile(path.join(install,'user-notes.txt'),'utf8'),'unrelated-file');
  assert.equal(await fs.readFile(marker,'utf8'),'user-profile-marker-do-not-remove');
  console.log('PASS real uninstall preserves unrelated files and per-user data');
 }finally{
  await stopApp();
  if(ownsPolicy&&await exists(helper))await invoke('uninstall');
  await fs.rm(marker,{force:true});await fs.rm(install,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
