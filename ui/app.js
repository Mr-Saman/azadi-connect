'use strict';
const $=id=>document.getElementById(id);
let page='dashboard',state={profiles:[],apps:[],language:'fa',theme:'dark',mode:'apps',connection:{status:'disconnected',upload:0,download:0},encryption:false};
const api=window.azadi;
const appIcons=new Map();let runningApps=null,iconRequest=false;
const sameApp=(a,b)=>a.toLowerCase()===b.toLowerCase();
const hasApp=filename=>state.apps.some(p=>sameApp(p,filename));
const appMatches=filename=>filename.toLocaleLowerCase().includes($('app-search').value.trim().toLocaleLowerCase());
function rememberIcons(items){for(const item of items||[]){if(item.path)appIcons.set(item.path.toLowerCase(),item.icon||null);}}
function appAvatar(filename){
 const avatar=el('span','app-avatar'),src=appIcons.get(filename.toLowerCase());
 avatar.textContent=filename.split('\\').pop().slice(0,1).toUpperCase();
 if(typeof src==='string'&&/^data:image\/png;base64,/.test(src)){const img=el('img');img.src=src;img.alt='';img.width=32;img.height=32;img.addEventListener('error',()=>img.remove());avatar.append(img);}
 return avatar;
}
async function loadAppIcons(){
 if(iconRequest||!api?.appIcons||!state.apps.some(p=>!appIcons.has(p.toLowerCase())))return;
 iconRequest=true;
 try{const result=await api.appIcons();if(result?.ok){rememberIcons(result.data);appRows($('quick-app-list'),2);appRows($('apps-list'));}}catch{}finally{iconRequest=false;}
}

const t=key=>window.messages[state.language]?.[key] || window.messages.en[key] || key;
const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
function iconElement(name,cls=''){const e=el('span',cls);e.innerHTML=window.icon(name);return e;}
const toastQueue=[];
function toast(message,error=false){
 if(toastQueue.some(item=>item.message===message)||toast.current===message)return;
 toastQueue.push({message,error});if(!toast.current)showToast();
}
function showToast(){
 const item=toastQueue.shift();if(!item){toast.current=null;return;}
 toast.current=item.message;const box=$('toast');box.replaceChildren(el('span','',item.message));
 const dismiss=el('button','toast-dismiss','×');dismiss.type='button';dismiss.setAttribute('aria-label',t('dismiss'));
 const close=()=>{clearTimeout(toast.timer);box.classList.remove('visible');toast.current=null;setTimeout(showToast,180);};
 dismiss.addEventListener('click',close);box.append(dismiss);box.classList.toggle('error',item.error);box.classList.add('visible');
 box.setAttribute('role',item.error?'alert':'status');box.setAttribute('aria-live',item.error?'assertive':'polite');
 toast.timer=setTimeout(close,item.error?10000:5000);
}
async function call(name,...args){
 if(!api){toast(t('preview'));return null;}
 try{
  const result=await api[name](...args);
  if(!result?.ok){const key=result?.error || 'operationFailed';let message=t(key);if(key==='invalidProfile'&&result.detail&&result.detail!==key)message+='\n'+result.detail;toast(message,true);return null;}
  if(result.data?.connection){state=result.data;render();}return result.data;
 }catch{toast(t('operationFailed'),true);return null;}
}
function navigate(value){page=value;document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+page));document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.page===page));updateTitles();$('workspace-content').scrollTop=0;}
function updateTitles(){$('page-title').textContent=t(page+'Title');$('page-subtitle').textContent=t(page+'Sub');}
function formatBytes(bytes){if(!bytes)return '0 B';const i=Math.min(3,Math.floor(Math.log(bytes)/Math.log(1024)));return (bytes/1024**i).toFixed(i?1:0)+' '+['B','KB','MB','GB'][i];}
function duration(){if($('timer-remaining'))$('timer-remaining').textContent=state.disconnectAt?Math.max(0,Math.ceil((state.disconnectAt-Date.now())/60000))+' min':'';const seconds=state.connection.startedAt?Math.max(0,Math.floor((Date.now()-state.connection.startedAt)/1000)):0;$('duration').textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(s=>String(s).padStart(2,'0')).join(':');}
function empty(target,title,subtitle,action){
 const row=el('div','empty');row.append(iconElement('layers','empty-icon'));const content=el('div');content.append(el('strong','',t(title)),el('p','',t(subtitle)));row.append(content);
 if(action){const button=el('button','button secondary',t(action.label));button.addEventListener('click',action.click);row.append(button);}target.append(row);
}
function appRows(target,limit){
 target.replaceChildren();if(!state.apps.length){empty(target,'noApps','noAppsSub');return;}
 const files=limit?state.apps.slice(0,limit):state.apps.filter(appMatches);
 if(!limit)$('app-search-count').textContent=files.length.toLocaleString(state.language);
 if(!files.length){empty(target,'noMatches','noMatchesSub');return;}
 for(const filename of files){
  const name=filename.split('\\').pop();const row=el('div','item-row');row.append(appAvatar(filename));const meta=el('div','item-meta');meta.append(el('strong','',name),el('small','',filename));row.append(meta,el('span','protocol-pill',t(state.mode==='system'||state.apps.includes(filename)?'viaVpn':'direct')));
  if(!limit){const remove=el('button','icon-button remove');remove.innerHTML=window.icon('trash');remove.setAttribute('aria-label',t('delete')+' '+name);remove.disabled=['connected','connecting'].includes(state.connection.status)||!!state.networkLock?.active||!!state.networkLock?.unknown;remove.addEventListener('click',()=>call('removeApp',filename));row.append(remove);}target.append(row);
 }
}
function renderRunningApps(){
 const target=$('running-list');if(runningApps===null)return;
 target.classList.remove('hidden');target.replaceChildren(el('h3','',t('runningApps')));
 if(!runningApps.length){target.append(el('p','muted',t('noRunning')));return;}
 const files=runningApps.filter(appMatches);
 if(!files.length){empty(target,'noMatches','noMatchesSub');return;}
 for(const filename of files){
  const row=el('div','item-row'),meta=el('div','item-meta');meta.append(el('strong','',filename.split('\\').pop()),el('small','',filename));
  const add=el('button','button secondary',t(hasApp(filename)?'added':'addApp'));
  add.disabled=hasApp(filename)||['connected','connecting'].includes(state.connection.status)||!!state.networkLock?.active||!!state.networkLock?.unknown;
  add.addEventListener('click',()=>call('chooseApp',filename));row.append(appAvatar(filename),meta,add);target.append(row);
 }
}
function renderProfiles(){
 const target=$('profiles-list');target.replaceChildren();if(!state.profiles.length){empty(target,'noProfiles','noProfilesSub',{label:'import',click:openImport});return;}
 for(const p of state.profiles){const row=el('div','item-row');row.append(iconElement('globe','app-avatar'));const meta=el('div','item-meta');meta.append(el('strong','',p.name),el('small','',p.server));row.append(meta,el('span','protocol-pill',p.protocol));const actions=el('div','row-actions');const select=el('button','button secondary',t(p.id===state.selectedId?'selected':'select'));select.disabled=['connected','connecting'].includes(state.connection.status)||!!state.networkLock?.active||!!state.networkLock?.unknown||p.id===state.selectedId;select.addEventListener('click',()=>call('selectProfile',p.id));const remove=el('button','icon-button remove');remove.innerHTML=window.icon('trash');remove.setAttribute('aria-label',t('delete')+' '+p.name);remove.disabled=['connected','connecting'].includes(state.connection.status)||!!state.networkLock?.active||!!state.networkLock?.unknown;remove.addEventListener('click',()=>{if(window.confirm(t('confirmDelete')))call('deleteProfile',p.id);});actions.append(select,remove);row.append(actions);target.append(row);}
}
function render(){
 const language=state.language==='en'?'en':'fa';document.documentElement.lang=language;document.documentElement.dir=language==='fa'?'rtl':'ltr';document.documentElement.dataset.theme=state.theme;
 document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>e.placeholder=t(e.dataset.i18nPlaceholder));updateTitles();
 $('language').textContent=language==='fa'?'EN ⇄':'فا ⇄';$('profile-count').textContent=state.profiles.length.toLocaleString(language==='fa'?'fa-IR':'en-US');
 const status=state.connection.status;const active=status==='connected';const busy=status==='connecting';const locked=active||busy||state.networkLock?.active||state.networkLock?.unknown;
 $('state-badge').textContent=t(status);$('state-badge').className='state-badge '+status;$('orbital').className='orbital '+status;
 $('status-title').textContent=t(status);$('status-caption').textContent=t(status+'Caption');$('connect-label').textContent=t(active?'disconnect':busy?'connecting':'connect');
 $('connect').disabled=busy;$('power').disabled=busy;$('connect').classList.toggle('secondary',active);$('power').setAttribute('aria-label',t(active?'disconnect':'connect'));
 $('download').textContent=formatBytes(state.connection.download);$('upload').textContent=formatBytes(state.connection.upload);$('latency').textContent=(state.connection.latency??'—')+' ms';duration();
 $('session-timer').disabled=!active; if(!state.disconnectAt)$('session-timer').value='0';
 const update=state.update||{status:'idle'};
 $('update-status').textContent=t('update_'+update.status)+(update.version?' · '+update.version:'')+(update.status==='downloading'?' · '+update.progress+'%':'');
 $('update-action').textContent=t(update.status==='available'?'downloadUpdate':update.status==='ready'?'installUpdate':'checkUpdate');
 $('update-action').disabled=['checking','downloading'].includes(update.status);
 const lock=state.networkLock||{},protectedNetwork=!!lock.active;
 $('network-lock-banner').classList.toggle('hidden',!protectedNetwork&&!lock.unknown);
 $('lock-banner-title').textContent=t(lock.unknown?'lockUnknown':lock.complete===false?'lockIncomplete':'lockArmed');
 $('restore-network').disabled=busy;$('kill-switch').checked=!!state.killSwitch;$('kill-switch').disabled=busy||active;
 $('connection-error').classList.toggle('hidden',!state.connection.error);
 $('error-message').textContent=t(state.connection.error||'error');$('error-detail').textContent=state.connection.detail||t('operationFailed');
 $('copy-diagnostics').disabled=!state.connection.detail;
 $('footer-status').textContent=t(lock.unknown||lock.complete===false?'lockUnknown':active?'connected':protectedNetwork?(lock.mode==='system'?'lockedSystem':'lockedApps'):status==='error'?'error':'direct');$('vault-state').textContent=state.encryption?'DPAPI':'—';
 const select=$('profile-select');select.replaceChildren();const placeholder=el('option','',t('emptySelect'));placeholder.value='';select.append(placeholder);for(const p of state.profiles){const option=el('option','',p.name+' · '+p.protocol);option.value=p.id;select.append(option);}select.value=state.selectedId||'';select.disabled=locked;
 const selected=state.profiles.find(p=>p.id===state.selectedId);$('profile-info').textContent=selected?.server||'WireGuard · VLESS · Shadowsocks · OpenVPN';
 $('profile-info').title=selected?.protocol==='wireguard'?(state.language==='fa'?'محدودهٔ AllowedIPs حفظ می‌شود؛ دسترسی کامل اینترنت به سرور بستگی دارد.':'AllowedIPs are preserved; full internet access depends on your server.'):(selected?.notes||[]).join('\n');
 $('mode-apps').classList.toggle('selected',state.mode==='apps');$('mode-system').classList.toggle('selected',state.mode==='system');$('mode-apps').disabled=locked;$('mode-system').disabled=locked;
 $('add-app').disabled=locked;$('running-apps').disabled=locked;document.querySelectorAll('.import-trigger').forEach(e=>e.disabled=locked);
 appRows($('quick-app-list'),2);appRows($('apps-list'));renderRunningApps();renderProfiles();loadAppIcons();
 if(state.update?.error&&render.lastUpdateError!==state.update.error)toast(t(state.update.error),true);render.lastUpdateError=state.update?.error;
 if(render.lastStatus&&render.lastStatus!==status&&['connected','disconnected'].includes(status))toast(t(status));
 render.lastStatus=status;
 if(state.connection.error && render.lastError!==state.connection.error){toast(t(state.connection.error),true);}render.lastError=state.connection.error;
}
function openImport(){$('import-dialog').showModal();$('profile-text').focus();}
function credentials(){return{username:$('vpn-username').value,password:$('vpn-password').value};}
function clearImport(){$('profile-text').value='';$('vpn-username').value='';$('vpn-password').value='';}
async function connect(){if(state.connection.status==='connected')await call('disconnect');else await call('connect');}
document.querySelectorAll('.nav-item').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.page)));
document.querySelectorAll('.import-trigger').forEach(e=>e.addEventListener('click',openImport));
$('close-import').addEventListener('click',()=>{$('import-dialog').close();clearImport();});
$('import-dialog').addEventListener('cancel',clearImport);
$('file-import').addEventListener('click',async()=>{const result=await call('importFile',credentials());if(result){$('import-dialog').close();clearImport();}});
$('import-form').addEventListener('submit',async event=>{event.preventDefault();$('paste-import').disabled=true;try{const result=await call('importText',$('profile-text').value,credentials());if(result){$('import-dialog').close();clearImport();}}finally{$('paste-import').disabled=false;}});
$('profile-select').addEventListener('change',e=>{if(e.target.value)call('selectProfile',e.target.value);});
$('mode-apps').addEventListener('click',()=>call('preferences',{mode:'apps'}));$('mode-system').addEventListener('click',()=>call('preferences',{mode:'system'}));
$('connect').addEventListener('click',connect);$('power').addEventListener('click',connect);
$('manage-apps').addEventListener('click',()=>navigate('apps'));$('add-app').addEventListener('click',()=>call('addApp'));
$('app-search').addEventListener('input',()=>{appRows($('apps-list'));renderRunningApps();});
$('running-apps').addEventListener('click',async()=>{
 const button=$('running-apps');button.disabled=true;button.setAttribute('aria-busy','true');
 try{
  const items=await call('runningApps');if(!items)return;
  rememberIcons(items);runningApps=items.map(item=>typeof item==='string'?item:item.path).filter(Boolean);renderRunningApps();
 }finally{button.disabled=['connected','connecting'].includes(state.connection.status)||!!state.networkLock?.active||!!state.networkLock?.unknown;button.removeAttribute('aria-busy');}
});
const setLanguage=language=>call('preferences',{language});const setTheme=()=>call('preferences',{theme:state.theme==='dark'?'light':'dark'});
$('language').addEventListener('click',()=>setLanguage(state.language==='fa'?'en':'fa'));$('set-fa').addEventListener('click',()=>setLanguage('fa'));$('set-en').addEventListener('click',()=>setLanguage('en'));$('theme').addEventListener('click',setTheme);$('set-theme').addEventListener('click',setTheme);
$('kill-switch').addEventListener('change',e=>call('preferences',{killSwitch:e.target.checked}));
$('open-shortcuts').addEventListener('click',async()=>{if(await call('openShortcuts'))toast(t('pinHint'));});
$('restore-network').addEventListener('click',()=>call('restoreNetwork'));
$('copy-diagnostics').addEventListener('click',async()=>{if(await call('copyDiagnostics'))toast(t('diagnosticsCopied'));});
$('win-min').addEventListener('click',()=>call('window','minimize'));$('win-max').addEventListener('click',()=>call('window','maximize'));$('win-close').addEventListener('click',()=>call('window','close'));$('project-link').addEventListener('click',()=>call('openProject'));$('star-project').addEventListener('click',()=>call('openProject'));
if(api){api.onState(value=>{state=value;render();});call('state');}else render();
setInterval(duration,1000);

$('session-timer').addEventListener('change',async e=>{if(await call('setTimer',Number(e.target.value)))toast(t('timerSaved'));});

$('update-action').addEventListener('click',()=>{const status=state.update?.status;const action=status==='available'?'download':status==='ready'?'install':'check';if(action==='install'&&!window.confirm(t('installConfirm')))return;call('update',action);});
