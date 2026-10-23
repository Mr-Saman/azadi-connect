'use strict';
const $=id=>document.getElementById(id);
let page='dashboard',state={profiles:[],apps:[],language:'fa',theme:'dark',mode:'apps',connection:{status:'disconnected',upload:0,download:0},encryption:false};
const api=window.azadi;
const t=key=>window.messages[state.language]?.[key] || window.messages.en[key] || key;
const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
function iconElement(name,cls=''){const e=el('span',cls);e.innerHTML=window.icon(name);return e;}
function toast(message,error=false){const e=$('toast');e.textContent=message;e.classList.toggle('error',error);e.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('visible'),7000);}
async function call(name,...args){
 if(!api){toast(t('preview'));return null;}
 try{
  const result=await api[name](...args);
  if(!result?.ok){const key=result?.error || 'operationFailed';let message=t(key);if(key==='invalidProfile'&&result.detail&&result.detail!==key)message+='\n'+result.detail;toast(message,true);return null;}
  if(result.data?.connection){state=result.data;render();}return result.data;
 }catch{toast(t('operationFailed'),true);return null;}
}
function navigate(value){page=value;document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+page));document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.page===page));updateTitles();}
function updateTitles(){$('page-title').textContent=t(page+'Title');$('page-subtitle').textContent=t(page+'Sub');}
function formatBytes(bytes){if(!bytes)return '0 B';const i=Math.min(3,Math.floor(Math.log(bytes)/Math.log(1024)));return (bytes/1024**i).toFixed(i?1:0)+' '+['B','KB','MB','GB'][i];}
function duration(){const seconds=state.connection.startedAt?Math.max(0,Math.floor((Date.now()-state.connection.startedAt)/1000)):0;$('duration').textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(s=>String(s).padStart(2,'0')).join(':');}
function empty(target,title,subtitle,action){
 const row=el('div','empty');row.append(iconElement('layers','empty-icon'));const content=el('div');content.append(el('strong','',t(title)),el('p','',t(subtitle)));row.append(content);
 if(action){const button=el('button','button secondary',t(action.label));button.addEventListener('click',action.click);row.append(button);}target.append(row);
}
function appRows(target,limit){
 target.replaceChildren();if(!state.apps.length){empty(target,'noApps','noAppsSub');return;}
 for(const filename of state.apps.slice(0,limit||500)){
  const name=filename.split('\\').pop();const row=el('div','item-row');row.append(el('span','app-avatar',name.slice(0,1).toUpperCase()));const meta=el('div','item-meta');meta.append(el('strong','',name),el('small','',filename));row.append(meta,el('span','protocol-pill',t(state.mode==='system'||state.apps.includes(filename)?'viaVpn':'direct')));
  if(!limit){const remove=el('button','icon-button remove');remove.innerHTML=window.icon('trash');remove.setAttribute('aria-label',t('delete')+' '+name);remove.disabled=['connected','connecting'].includes(state.connection.status);remove.addEventListener('click',()=>call('removeApp',filename));row.append(remove);}target.append(row);
 }
}
function renderProfiles(){
 const target=$('profiles-list');target.replaceChildren();if(!state.profiles.length){empty(target,'noProfiles','noProfilesSub',{label:'import',click:openImport});return;}
 for(const p of state.profiles){const row=el('div','item-row');row.append(iconElement('globe','app-avatar'));const meta=el('div','item-meta');meta.append(el('strong','',p.name),el('small','',p.server));row.append(meta,el('span','protocol-pill',p.protocol));const actions=el('div','row-actions');const select=el('button','button secondary',t(p.id===state.selectedId?'selected':'select'));select.disabled=['connected','connecting'].includes(state.connection.status)||p.id===state.selectedId;select.addEventListener('click',()=>call('selectProfile',p.id));const remove=el('button','icon-button remove');remove.innerHTML=window.icon('trash');remove.setAttribute('aria-label',t('delete')+' '+p.name);remove.disabled=['connected','connecting'].includes(state.connection.status);remove.addEventListener('click',()=>{if(window.confirm(t('confirmDelete')))call('deleteProfile',p.id);});actions.append(select,remove);row.append(actions);target.append(row);}
}
function render(){
 const language=state.language==='en'?'en':'fa';document.documentElement.lang=language;document.documentElement.dir=language==='fa'?'rtl':'ltr';document.documentElement.dataset.theme=state.theme;
 document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});updateTitles();
 $('language').textContent=language==='fa'?'EN ⇄':'فا ⇄';$('profile-count').textContent=state.profiles.length.toLocaleString(language==='fa'?'fa-IR':'en-US');
 const status=state.connection.status;const active=status==='connected';const busy=status==='connecting';const locked=active||busy;
 $('state-badge').textContent=t(status);$('state-badge').className='state-badge '+status;$('orbital').className='orbital '+status;
 $('status-title').textContent=t(status);$('status-caption').textContent=t(status+'Caption');$('connect-label').textContent=t(active?'disconnect':busy?'connecting':'connect');
 $('connect').disabled=busy;$('power').disabled=busy;$('connect').classList.toggle('secondary',active);$('power').setAttribute('aria-label',t(active?'disconnect':'connect'));
 $('download').textContent=formatBytes(state.connection.download);$('upload').textContent=formatBytes(state.connection.upload);$('latency').textContent=(state.connection.latency??'—')+' ms';duration();
 $('footer-status').textContent=t(active?'connected':status==='error'?'error':'direct');$('vault-state').textContent=state.encryption?'DPAPI':'—';
 const select=$('profile-select');select.replaceChildren();const placeholder=el('option','',t('emptySelect'));placeholder.value='';select.append(placeholder);for(const p of state.profiles){const option=el('option','',p.name+' · '+p.protocol);option.value=p.id;select.append(option);}select.value=state.selectedId||'';select.disabled=locked;
 const selected=state.profiles.find(p=>p.id===state.selectedId);$('profile-info').textContent=selected?.server||'WireGuard · VLESS · Shadowsocks · OpenVPN';
 $('mode-apps').classList.toggle('selected',state.mode==='apps');$('mode-system').classList.toggle('selected',state.mode==='system');$('mode-apps').disabled=locked;$('mode-system').disabled=locked;
 $('add-app').disabled=locked;$('running-apps').disabled=locked;document.querySelectorAll('.import-trigger').forEach(e=>e.disabled=locked);
 appRows($('quick-app-list'),2);appRows($('apps-list'));renderProfiles();
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
$('running-apps').addEventListener('click',async()=>{
 const files=await call('runningApps');if(!files)return;const target=$('running-list');target.classList.remove('hidden');target.replaceChildren(el('h3','',t('runningApps')));
 if(!files.length)target.append(el('p','muted',t('noRunning')));
 for(const filename of files){const row=el('div','item-row');const meta=el('div','item-meta');meta.append(el('strong','',filename.split('\\').pop()),el('small','',filename));const add=el('button','button secondary',t(state.apps.includes(filename)?'added':'addApp'));add.disabled=state.apps.includes(filename);add.addEventListener('click',async()=>{if(await call('chooseApp',filename)){add.disabled=true;add.textContent=t('added');}});row.append(meta,add);target.append(row);}
});
const setLanguage=language=>call('preferences',{language});const setTheme=()=>call('preferences',{theme:state.theme==='dark'?'light':'dark'});
$('language').addEventListener('click',()=>setLanguage(state.language==='fa'?'en':'fa'));$('set-fa').addEventListener('click',()=>setLanguage('fa'));$('set-en').addEventListener('click',()=>setLanguage('en'));$('theme').addEventListener('click',setTheme);$('set-theme').addEventListener('click',setTheme);
$('win-min').addEventListener('click',()=>call('window','minimize'));$('win-max').addEventListener('click',()=>call('window','maximize'));$('win-close').addEventListener('click',()=>call('window','close'));$('project-link').addEventListener('click',()=>call('openProject'));
if(api){api.onState(value=>{state=value;render();});call('state');}else render();
setInterval(duration,1000);
