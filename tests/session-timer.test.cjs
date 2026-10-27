const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SessionTimer}=require('../app/lib/session-timer.cjs');
test('timer expires once after a clock jump and supports cancellation',async()=>{
 let now=1000,calls=0;const timer=new SessionTimer(()=>calls++,()=>{},()=>now);
 timer.set(1);now+=60001;timer.check();timer.check();await new Promise(setImmediate);
 assert.equal(calls,1);assert.equal(timer.deadline,null);
 timer.set(10);timer.set(0);now+=900000;timer.check();await new Promise(setImmediate);assert.equal(calls,1);
});
test('invalid timer changes preserve the existing deadline',()=>{
 const timer=new SessionTimer(()=>{});timer.set(5);const deadline=timer.deadline;
 for(const value of [-1,1441,NaN,0.5,'5'])assert.throws(()=>timer.set(value),{code:'invalidTimer'});
 assert.equal(timer.deadline,deadline);timer.clear();
});
