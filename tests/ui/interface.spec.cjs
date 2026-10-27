const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const testIcon='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../../ui/assets/tray.png')).toString('base64');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
test.beforeEach(async({page})=>{
 await page.addInitScript(icon=>{
  let state={version:'0.4.1',profiles:[],apps:[],language:'fa',theme:'dark',mode:'apps',connection:{status:'disconnected',upload:0,download:0},encryption:true};
  const response=()=>Promise.resolve({ok:true,data:structuredClone(state)});
  window.azadi={state:response,onState:()=>{},preferences:changes=>{Object.assign(state,changes);return response();},importText:raw=>{state.profiles.push({id:'example',name:raw,protocol:'vless',server:'example.invalid'});state.selectedId='example';return response();},selectProfile:id=>{state.selectedId=id;return response();},deleteProfile:()=>{state.profiles=[];return response();},connect:()=>Promise.resolve({ok:false,error:'selectApps'}),disconnect:response,window:response,openProject:response,appIcons:()=>Promise.resolve({ok:true,data:state.apps.map(path=>({path,icon}))}),runningApps:()=>Promise.resolve({ok:true,data:[{path:'C:\\Example\\example.exe',name:'example.exe',icon},{path:'C:\\Tools\\Reader.exe',name:'Reader.exe',icon:null},{path:'C:\\Browser\\firefox.exe',name:'firefox.exe',icon}]}),chooseApp:p=>{state.apps.push(p);return response();}};
 },testIcon);
 await page.goto(pathToFileURL(path.join(root,'ui/index.html')).href);
 await page.evaluate(()=>document.fonts.ready);
});
test('Persian uses local Vazir, RTL and visible dual-language Iran footer',async({page})=>{
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('h1')).toHaveText('اتصال، به سبک خودت.');
 expect(await page.evaluate(()=>document.fonts.check('12px Vazir'))).toBeTruthy();
 await expect(page.locator('.for-iran')).toContainText('برای ایران');await expect(page.locator('.for-iran')).toContainText('For Iran');
 const b=await page.locator('footer').boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(850);
 await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/persian-dark.png')});
});
test('English changes direction, text and font; light theme works',async({page})=>{
 await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('dir','ltr');await expect(page.locator('h1')).toHaveText('Connect on your terms.');
 expect(await page.evaluate(()=>getComputedStyle(document.body).fontFamily)).toMatch(/^Inter/);
 await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/english-dark.png')});
 await page.locator('#theme').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/english-light.png')});
});
test('imported profile names render as text and cannot inject HTML',async({page})=>{
 await page.locator('.import-trigger').first().click();await page.locator('#profile-text').fill('<img src=x onerror="window.injected=true">');await page.locator('#paste-import').click();
 await page.locator('[data-page=profiles]').click();await expect(page.locator('#profiles-list')).toContainText('<img src=x');expect(await page.locator('#profiles-list img').count()).toBe(0);expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});
test('application picker, mode switching and errors are functional',async({page})=>{
 await page.locator('#mode-system').click();await expect(page.locator('#mode-system')).toHaveClass(/selected/);
 await page.locator('[data-page=apps]').click();await page.locator('#running-apps').click();await page.locator('#running-list button').first().click();await expect(page.locator('#apps-list')).toContainText('example.exe');
 await page.locator('[data-page=dashboard]').click();await page.locator('#connect').click();await expect(page.locator('#toast')).toHaveClass(/error/);
});
test('all language keys match and every page remains within the desktop width',async({page})=>{
 expect(await page.evaluate(()=>JSON.stringify(Object.keys(messages.fa).sort())===JSON.stringify(Object.keys(messages.en).sort()))).toBeTruthy();
 await page.setViewportSize({width:980,height:740});
 for(const name of ['dashboard','profiles','apps','settings']){await page.locator(`[data-page=${name}]`).click();expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBeTruthy();}
});
test('Kill Switch is optional and changing the preference alone does not claim an armed lock',async({page})=>{
 await page.locator('[data-page=settings]').click();
 await expect(page.locator('#kill-switch')).not.toBeChecked();
 await page.locator('#kill-switch').check();
 await expect(page.locator('#kill-switch')).toBeChecked();
 await expect(page.locator('#network-lock-banner')).toBeHidden();
 await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/kill-switch.png')});
});
test('engine details stay visible as text and persistent protection has explicit recovery',async({page})=>{
 await page.evaluate(()=>{
  const failed={version:'0.2.0',language:'en',theme:'dark',mode:'system',apps:[],profiles:[],encryption:true,killSwitch:true,networkLock:{active:true,complete:true,mode:'system'},connection:{status:'error',error:'coreFailed',detail:'stage=startup\nexit=23\nFATAL TUN unavailable <img src=x>'}};
  window.azadi.connect=async()=>({ok:true,data:structuredClone(failed)});
  window.azadi.copyDiagnostics=async()=>{window.copied=true;return {ok:true,data:true};};
  window.azadi.restoreNetwork=async()=>({ok:true,data:{...failed,killSwitch:false,networkLock:{active:false},connection:{status:'disconnected'}}});
 });
 await page.locator('#connect').click();
 await expect(page.locator('#connection-error')).toBeVisible();await expect(page.locator('#error-detail')).toContainText('exit=23');
 await expect(page.locator('#error-detail')).toContainText('<img src=x>');expect(await page.locator('#error-detail img').count()).toBe(0);
 await expect(page.locator('#error-message')).not.toContainText('kill switch');
 await expect(page.locator('#network-lock-banner')).toBeVisible();await expect(page.locator('#mode-apps')).toBeDisabled();
 await page.locator('#copy-diagnostics').click();expect(await page.evaluate(()=>window.copied)).toBeTruthy();
 await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/diagnostics.png')});
 await page.locator('#restore-network').click();await expect(page.locator('#network-lock-banner')).toBeHidden();
 await expect(page.locator('#footer-status')).toHaveText('Direct internet');await expect(page.locator('#mode-apps')).toBeEnabled();
});

test('overview fits the minimum window and long lists scroll without moving the header or footer',async({page})=>{
 for(const size of [{width:1240,height:850},{width:980,height:740}]){
  await page.setViewportSize(size);
  expect(await page.locator('#workspace-content').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBeTruthy();
  await expect(page.getByText('Made with ChatGPT')).toHaveCount(0);
 }
 await page.evaluate(()=>{window.azadi.runningApps=async()=>({ok:true,data:Array.from({length:60},(_,i)=>({path:'C:\\Apps\\Program'+i+'.exe',icon:null}))});});
 await page.locator('[data-page=apps]').click();await page.locator('#running-apps').click();
 const header=await page.locator('.topline').boundingBox(),footer=await page.locator('footer').boundingBox();
 await page.locator('#workspace-content').evaluate(e=>e.scrollTop=e.scrollHeight);
 expect((await page.locator('.topline').boundingBox()).y).toBe(header.y);
 expect((await page.locator('footer').boundingBox()).y).toBe(footer.y);
 expect(await page.evaluate(()=>document.documentElement.scrollTop===0&&document.body.scrollHeight===innerHeight)).toBeTruthy();
});
test('application search filters running and selected apps, with native icons and safe fallback',async({page})=>{
 await page.locator('[data-page=apps]').click();await page.locator('#running-apps').click();
 await expect(page.locator('#running-list .item-row')).toHaveCount(3);
 await expect(page.locator('#running-list .app-avatar img')).toHaveCount(2);
 await page.locator('#app-search').fill('FIREFOX');await expect(page.locator('#running-list .item-row')).toHaveCount(1);
 await page.locator('#running-list button').click();await expect(page.locator('#apps-list')).toContainText('firefox.exe');
 await expect(page.locator('#apps-list .app-avatar img')).toHaveCount(1);
 await page.locator('#app-search').fill('reader');await expect(page.locator('#running-list .item-row')).toHaveCount(1);
 await expect(page.locator('#running-list .app-avatar img')).toHaveCount(0);
 await expect(page.locator('#apps-list .item-row')).toHaveCount(0);
 await page.locator('#app-search').fill('no-such-application');await expect(page.locator('#running-list .item-row')).toHaveCount(0);
 await page.locator('#app-search').fill('');await expect(page.locator('#running-list .item-row')).toHaveCount(3);
 await page.locator('#language').click();await expect(page.locator('#app-search')).toHaveAttribute('placeholder','Search by app name or file path…');
 await page.screenshot({animations:'disabled',path:path.join(root,'docs/screenshots/applications.png')});
});
test('GitHub support is localized and opens only through the project action',async({page})=>{
 await page.evaluate(()=>{window.azadi.openProject=async()=>{window.projectOpened=true;return{ok:true,data:true};};});
 await expect(page.locator('#star-project')).toContainText('با استار');await page.locator('#star-project').click();
 expect(await page.evaluate(()=>window.projectOpened)).toBeTruthy();
 await page.locator('#language').click();await expect(page.locator('#star-project')).toContainText('Star on GitHub');
 await page.locator('[data-page=settings]').click();await expect(page.locator('main')).not.toContainText('ChatGPT');
});

test('localized pin action reveals the installed shortcut and explains the Windows choice',async({page})=>{
 await page.evaluate(()=>{window.azadi.openShortcuts=async()=>{window.shortcutOpened=true;return {ok:true,data:true};};});
 await page.locator('[data-page=settings]').click();
 await expect(page.locator('#open-shortcuts')).toHaveText('نمایش میانبر برای پین');await page.locator('#open-shortcuts').click();
 expect(await page.evaluate(()=>window.shortcutOpened)).toBeTruthy();await expect(page.locator('#toast')).toContainText('Pin to Start');
 await page.locator('#language').click();await expect(page.locator('#open-shortcuts')).toHaveText('Show shortcut to pin');
 await page.locator('#open-shortcuts').click();await expect(page.locator('#toast')).toContainText('Pin to taskbar');
});

test('session timer is disabled until connected and update center exposes download state',async({page})=>{
 await page.locator('[data-page=settings]').click();
 await expect(page.locator('#session-timer')).toBeDisabled();
 await page.evaluate(async()=>{
  window.azadi.state=async()=>({ok:true,data:{version:'0.4.1',profiles:[],apps:[],language:'en',theme:'dark',mode:'apps',connection:{status:'connected',startedAt:Date.now()},update:{status:'available',version:'0.5.0'}}});
  await call('state');
 });
 await expect(page.locator('#session-timer')).toBeEnabled();
 await expect(page.locator('#update-action')).toHaveText('Download update');
 await expect(page.locator('#update-status')).toContainText('0.5.0');
});
test('floating errors are dismissible and cannot inject markup',async({page})=>{
 await page.evaluate(()=>toast('<img src=x onerror=alert(1)>',true));
 await expect(page.locator('#toast')).toHaveAttribute('role','alert');
 await expect(page.locator('#toast img')).toHaveCount(0);
 await page.locator('#toast button').click();
 await expect(page.locator('#toast')).not.toHaveClass(/visible/);
});
