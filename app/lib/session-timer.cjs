'use strict';
const {AppError}=require('./errors.cjs');
// Main-process deadline: renderer reloads and minimized windows cannot pause it.
class SessionTimer {
  constructor(expire,notify=()=>{},clock=Date.now) { this.expire=expire;this.notify=notify;this.clock=clock;this.deadline=null; }
  set(minutes) {
    if(!Number.isInteger(minutes)||minutes<0||minutes>1440)throw new AppError('invalidTimer');
    this.clear();
    if(minutes){this.deadline=this.clock()+minutes*60000;this.timer=setInterval(()=>this.check(),1000);this.timer.unref?.();}
    this.notify();return this.deadline;
  }
  check(){if(this.deadline!==null&&this.clock()>=this.deadline){this.clear();this.notify();Promise.resolve().then(this.expire).catch(()=>this.notify());}}
  clear(){clearInterval(this.timer);this.deadline=null;}
}
module.exports={SessionTimer};
