const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePreferences}=require('../app/lib/preferences.cjs');
test('mixed preference requests reject invalid fields before side effects can run',()=>{
 assert.throws(()=>validatePreferences({killSwitch:false,mode:'invalid'}),{code:'invalidMode'});
 assert.throws(()=>validatePreferences({mode:'system',theme:'invalid'}));
 for(const value of [null,[],true,{killSwitch:'false'}])assert.throws(()=>validatePreferences(value));
 assert.doesNotThrow(()=>validatePreferences({killSwitch:false,language:'fa',theme:'light',mode:'apps'}));
});
