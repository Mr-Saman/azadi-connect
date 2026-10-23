'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, Tray, Menu, nativeImage, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Vault, systemExe } = require('./lib/vault.cjs');
const { NetworkLock } = require('./lib/network-lock.cjs');
const { Engine } = require('./lib/engine.cjs');
const { importProfiles, MAX_IMPORT } = require('./lib/importers.cjs');
const { normalizeApp } = require('./lib/config.cjs');
const { AppError } = require('./lib/errors.cjs');
const exec = promisify(execFile);
let window, tray, vault, engine, networkLock, data, quitting = false, writeQueue = Promise.resolve();
const uiPath=path.join(__dirname,'../ui/index.html');
const uiUrl=pathToFileURL(uiPath).href;
const appIconCache=new Map();
async function describeApps(filenames) {
  const results=new Array(filenames.length);let next=0;
  // Keep shell icon extraction bounded and cache it outside frequent state IPC.
  await Promise.all(Array.from({length:Math.min(6,filenames.length)},async()=>{
    while(next<filenames.length){
      const index=next++,filename=filenames[index],key=filename.toLowerCase();
      if(!appIconCache.has(key)){
        const pending=app.getFileIcon(filename,{size:'normal'}).then(image=>image.isEmpty()?null:image.toDataURL()).catch(()=>null);
        appIconCache.set(key,pending);
        if(appIconCache.size>750)appIconCache.delete(appIconCache.keys().next().value);
      }
      results[index]={path:filename,name:path.win32.basename(filename),icon:await appIconCache.get(key)};
    }
  }));
  return results;
}
const ownsInstance=app.requestSingleInstanceLock();
if(!ownsInstance)app.quit();
app.on('second-instance',(_,args)=>{ if(window){window.show();window.focus();} if(args.includes('--restore-network')){queueRecovery();} });
function snapshot() {
  return { version:app.getVersion(), platform:process.platform,
    profiles:data.profiles.map(p=>({id:p.id,name:p.name,protocol:p.protocol,notes:p.notes,server:p.endpoint.server || p.endpoint.peers?.[0]?.address || p.endpoint.servers?.[0]?.server || ''})),
    apps:data.apps, selectedId:data.selectedId, mode:data.mode, language:data.language, theme:data.theme || 'dark',
    killSwitch:!!data.killSwitch, networkLock:{...networkLock.state}, connection:{...engine.state}, encryption:safeStorage.isEncryptionAvailable(), coreVersion:'1.14.3' };
}
function notify() { if(window && !window.isDestroyed()) window.webContents.send('state-change',snapshot()); updateTray(); }
async function save() { await vault.write(data); notify(); return snapshot(); }
function idle() { if(engine.child || engine.busy || networkLock.state.active) throw new AppError('disconnectFirst'); }
function handler(name, fn, mutation = false) {
  ipcMain.handle(name,async(event,...args)=>{
    if(event.sender !== window.webContents || event.senderFrame?.url !== uiUrl) return {ok:false,error:'untrustedWindow'};
    const execute=async()=>{try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e instanceof AppError ? e.code : 'operationFailed',detail:e instanceof AppError ? e.message : undefined};}};
    if(!mutation) return execute();
    const task=writeQueue.then(execute,execute); writeQueue=task.then(()=>{}); return task;
  });
}
function queueRecovery() {
  const task=writeQueue.then(restoreNetwork);
  writeQueue=task.catch(e=>dialog.showErrorBox('Azadi Connect','Internet recovery failed / بازیابی انجام نشد\n'+(e instanceof AppError?e.message:'operationFailed')));
}
async function restoreNetwork() {
  await engine?.stop(); await networkLock.unlock();
  if(data){data.killSwitch=false;notify();return save();}
}
async function importRaw(raw,name,credentials) {
  idle(); const imported=importProfiles(raw,name,credentials || {});
  if(data.profiles.length+imported.length>500) throw new AppError('profileLimit');
  data.profiles.push(...imported); data.selectedId ||= imported[0].id; return save();
}
function wireHandlers() {
  handler('state',async()=>snapshot());
  handler('import-file',async(credentials)=>{
    idle(); const result=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'VPN profiles',extensions:['conf','ovpn','txt']}]});
    if(result.canceled) return snapshot();
    const file=result.filePaths[0]; const stat=await fs.stat(file); if(stat.size>MAX_IMPORT) throw new AppError('invalidProfile','Maximum file size is 2 MiB');
    return importRaw(await fs.readFile(file,'utf8'),path.basename(file),credentials);
  },true);
  handler('import-text',async(raw,credentials)=>importRaw(raw,'',credentials),true);
  handler('delete-profile',async id=>{idle();data.profiles=data.profiles.filter(p=>p.id!==id);if(data.selectedId===id)data.selectedId=data.profiles[0]?.id;return save();},true);
  handler('select-profile',async id=>{idle();if(!data.profiles.some(p=>p.id===id))throw new AppError('invalidProfile');data.selectedId=id;return save();},true);
  const add=async filename=>{idle();filename=normalizeApp(filename);const stat=await fs.stat(filename);if(!stat.isFile())throw new AppError('invalidApp');if(!data.apps.some(s=>s.toLowerCase()===filename.toLowerCase()))data.apps.push(filename);return save();};
  handler('add-app',async()=>{
    idle(); const result=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Windows application',extensions:['exe']}]});
    return result.canceled?snapshot():add(result.filePaths[0]);
  },true);
  handler('choose-app',add,true);
  handler('remove-app',async filename=>{idle();data.apps=data.apps.filter(s=>s!==filename);return save();},true);
  // Only the selected executable paths can be queried; no arbitrary file-read IPC.
  handler('app-icons',async()=>process.platform==='win32'?describeApps(data.apps.slice(0,500)):[]);
  handler('running-apps',async()=>{
    if(process.platform!=='win32')return [];
    const ps=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const script='Get-Process | Where-Object { $_.Path -and $_.Path.EndsWith(".exe") } | Select-Object -ExpandProperty Path -Unique | ConvertTo-Json -Compress';
    const {stdout}=await exec(ps,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:12000,maxBuffer:2*1024*1024});
    const values=JSON.parse(stdout.trim() || '[]');
    const filenames=[...new Set((Array.isArray(values)?values:[values]).filter(p=>{try{normalizeApp(p);return true;}catch{return false;}}))].slice(0,250);
    filenames.sort((a,b)=>path.win32.basename(a).localeCompare(path.win32.basename(b)));
    return describeApps(filenames);
  });
  handler('preferences',async changes=>{
    if(!changes || typeof changes!=='object')throw new AppError('operationFailed');
    if(changes.killSwitch!==undefined){if(typeof changes.killSwitch!=='boolean')throw new AppError('operationFailed');if(changes.killSwitch){idle();data.killSwitch=true;}else{await restoreNetwork();}}
    if(changes.mode!==undefined){idle();if(!['apps','system'].includes(changes.mode))throw new AppError('invalidMode');data.mode=changes.mode;}
    if(changes.language!==undefined){if(!['fa','en'].includes(changes.language))throw new AppError('operationFailed');data.language=changes.language;}
    if(changes.theme!==undefined){if(!['dark','light'].includes(changes.theme))throw new AppError('operationFailed');data.theme=changes.theme;}
    return save();
  },true);
  handler('connect',async()=>{
    if(process.platform!=='win32')throw new AppError('windowsOnly');
    if(!safeStorage.isEncryptionAvailable())throw new AppError('encryptionUnavailable');
    const p=data.profiles.find(p=>p.id===data.selectedId);if(!p)throw new AppError('selectProfile');
    await engine.connect(p,{mode:data.mode,apps:data.apps,killSwitch:!!data.killSwitch});return snapshot();
  },true);
  handler('disconnect',async()=>{await engine.stop();return snapshot();},true);
  handler('restore-network',restoreNetwork,true);
  handler('copy-diagnostics',async()=>{if(engine.state.detail)clipboard.writeText(engine.state.error+'\n'+engine.state.detail);return true;});
  handler('window',async action=>{
    if(action==='minimize')window.minimize();else if(action==='close')window.hide();else if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}
  });
  handler('open-project',async()=>shell.openExternal('https://github.com/Mr-Saman/azadi-connect'));
}
function updateTray() {
  if(!tray || !data)return;
  const fa=data.language==='fa';
  tray.setToolTip(`Azadi Connect · ${engine.state.status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:fa?'باز کردن آزادی':'Open Azadi Connect',click:()=>window.show()},
    {label:fa?'قطع اتصال':'Disconnect',enabled:!!engine.child,click:()=>engine.stop()},
    {label:fa?'بازیابی اینترنت مستقیم':'Restore direct Internet',enabled:!!engine.child||networkLock.state.active,click:()=>{queueRecovery();}},
    {type:'separator'}, {label:fa?'خروج (حفظ قفل شبکه)':'Quit (keep network lock)',click:()=>app.quit()}
  ]));
}
app.whenReady().then(async()=>{
  if(!ownsInstance)return;
  if(process.platform!=='win32' && !process.argv.includes('--ui-test')) { dialog.showErrorBox('Azadi Connect','This release supports Windows 10/11 x64.');app.quit();return; }
  if(process.platform==='win32') {
    try { await exec(systemExe('fltmc.exe'),[],{windowsHide:true,timeout:5000}); }
    catch {
      // The NSIS installer and this fallback request ordinary Windows UAC.
      // No configuration-controlled text is interpolated into this command.
      const executable=process.execPath.replace(/'/g,"''");
      const argument=app.isPackaged?'':` -ArgumentList '${app.getAppPath().replace(/'/g,"''")}'`;
      const script=`Start-Process -FilePath '${executable}'${argument} -Verb RunAs`;
      const ps=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      await exec(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});
      quitting=true;app.quit();return;
    }
  }
  const coreDirectory=app.isPackaged?path.join(process.resourcesPath,'core'):path.join(__dirname,'../resources/core');
  networkLock=new NetworkLock(coreDirectory,path.join(app.getPath('userData'),'private/runtime'));
  if(process.argv.includes('--restore-network')){await networkLock.unlock();dialog.showMessageBoxSync({type:'info',title:'Azadi Connect',message:'Direct Internet restored. / اینترنت مستقیم بازیابی شد.'});quitting=true;app.quit();return;}
  vault=new Vault(path.join(app.getPath('userData'),'private'),safeStorage);
  await vault.initialize(); data=await vault.read();
  if(!Array.isArray(data.profiles)||!Array.isArray(data.apps))throw new AppError('storageError');
  engine=new Engine(coreDirectory,path.join(vault.directory,'runtime'),{networkLock});
  await engine.initialize();
  try{await networkLock.refresh();if(networkLock.state.active)data.killSwitch=true;}catch{networkLock.state={active:false,unknown:true,error:'killSwitchFailed'};}
  engine.on('state',notify);engine.on('network-lock',notify);
  window=new BrowserWindow({width:1240,height:850,minWidth:980,minHeight:740,show:false,frame:false,backgroundColor:'#0b101d',
    title:'Azadi Connect',icon:path.join(__dirname,'../ui/assets/icon.png'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==uiUrl)event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
  window.webContents.session.webRequest.onBeforeRequest((details,callback)=>{
    const allowed=details.url.startsWith(pathToFileURL(path.join(__dirname,'../ui/')).href);
    callback({cancel:!allowed});
  });
  wireHandlers(); await window.loadFile(uiPath);window.show();
  window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();}});
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../ui/assets/tray.png')));tray.on('double-click',()=>window.show());updateTray();
}).catch(e=>{dialog.showErrorBox('Azadi Connect',e.code==='vaultLocked'?'The encrypted vault could not be opened by this Windows user.':'Secure initialization failed. '+(e.code || 'startupError'));quitting=true;app.quit();});
app.on('before-quit',event=>{if(!quitting){event.preventDefault();quitting=true;Promise.resolve(engine?.stop()).finally(()=>app.quit());}});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
