'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel,...args) => ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('azadi',Object.freeze({
  update:action=>invoke('update',action), setTimer:minutes=>invoke('session-timer',minutes), state:()=>invoke('state'), importFile:credentials=>invoke('import-file',credentials),
  importText:(raw,credentials)=>invoke('import-text',raw,credentials),
  deleteProfile:id=>invoke('delete-profile',id), selectProfile:id=>invoke('select-profile',id),
  addApp:()=>invoke('add-app'), removeApp:filename=>invoke('remove-app',filename),
  runningApps:()=>invoke('running-apps'), appIcons:()=>invoke('app-icons'), chooseApp:filename=>invoke('choose-app',filename),
  preferences:changes=>invoke('preferences',changes), connect:()=>invoke('connect'), disconnect:()=>invoke('disconnect'),
  restoreNetwork:()=>invoke('restore-network'), copyDiagnostics:()=>invoke('copy-diagnostics'),
  window:action=>invoke('window',action), openProject:()=>invoke('open-project'), openShortcuts:()=>invoke('open-shortcuts'),
  onState:callback=>{ const listener=(_,state)=>callback(state); ipcRenderer.on('state-change',listener); return ()=>ipcRenderer.removeListener('state-change',listener); }
}));
