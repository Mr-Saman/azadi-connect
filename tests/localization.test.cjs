const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('all English and Persian translations have matching nonempty keys',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../ui/i18n.js'),'utf8'),context);
 const {fa,en}=context.window.messages;
 assert.deepEqual(Object.keys(fa).sort(),Object.keys(en).sort());
 for(const language of [fa,en])for(const [key,value]of Object.entries(language))assert.ok(typeof value==='string'&&value.trim(),key);
});
