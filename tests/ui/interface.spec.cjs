const {test,expect}=require('@playwright/test');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  let state={version:'0.1.0',profiles:[],apps:[],language:'fa',theme:'dark',mode:'apps',connection:{status:'disconnected',upload:0,download:0},encryption:true};
  const response=()=>Promise.resolve({ok:true,data:structuredClone(state)});
  window.azadi={state:response,onState:()=>{},preferences:changes=>{Object.assign(state,changes);return response();},importText:raw=>{state.profiles.push({id:'example',name:raw,protocol:'vless',server:'example.invalid'});state.selectedId='example';return response();},selectProfile:id=>{state.selectedId=id;return response();},deleteProfile:()=>{state.profiles=[];return response();},connect:()=>Promise.resolve({ok:false,error:'selectApps'}),disconnect:response,window:response,openProject:response,runningApps:()=>Promise.resolve({ok:true,data:['C:\\Example\\example.exe']}),chooseApp:p=>{state.apps.push(p);return response();}};
 });
 await page.goto(pathToFileURL(path.join(root,'ui/index.html')).href);
 await page.evaluate(()=>document.fonts.ready);
});
test('Persian uses local Vazir, RTL and visible dual-language Iran footer',async({page})=>{
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('h1')).toHaveText('اتصال، به سبک خودت.');
 expect(await page.evaluate(()=>document.fonts.check('12px Vazir'))).toBeTruthy();
 await expect(page.locator('.for-iran')).toContainText('برای ایران');await expect(page.locator('.for-iran')).toContainText('For Iran');
 const b=await page.locator('footer').boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(850);
 await page.screenshot({path:path.join(root,'docs/screenshots/persian-dark.png')});
});
test('English changes direction, text and font; light theme works',async({page})=>{
 await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('dir','ltr');await expect(page.locator('h1')).toHaveText('Connect on your terms.');
 expect(await page.evaluate(()=>getComputedStyle(document.body).fontFamily)).toMatch(/^Inter/);
 await page.screenshot({path:path.join(root,'docs/screenshots/english-dark.png')});
 await page.locator('#theme').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.screenshot({path:path.join(root,'docs/screenshots/english-light.png')});
});
test('imported profile names render as text and cannot inject HTML',async({page})=>{
 await page.locator('.import-trigger').first().click();await page.locator('#profile-text').fill('<img src=x onerror="window.injected=true">');await page.locator('#paste-import').click();
 await page.locator('[data-page=profiles]').click();await expect(page.locator('#profiles-list')).toContainText('<img src=x');expect(await page.locator('#profiles-list img').count()).toBe(0);expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});
test('application picker, mode switching and errors are functional',async({page})=>{
 await page.locator('#mode-system').click();await expect(page.locator('#mode-system')).toHaveClass(/selected/);
 await page.locator('[data-page=apps]').click();await page.locator('#running-apps').click();await page.locator('#running-list button').click();await expect(page.locator('#apps-list')).toContainText('example.exe');
 await page.locator('[data-page=dashboard]').click();await page.locator('#connect').click();await expect(page.locator('#toast')).toHaveClass(/error/);
});
test('all language keys match and every page remains within the desktop width',async({page})=>{
 expect(await page.evaluate(()=>JSON.stringify(Object.keys(messages.fa).sort())===JSON.stringify(Object.keys(messages.en).sort()))).toBeTruthy();
 await page.setViewportSize({width:980,height:740});
 for(const name of ['dashboard','profiles','apps','settings']){await page.locator(`[data-page=${name}]`).click();expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBeTruthy();}
});
