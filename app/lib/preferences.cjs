'use strict';
const {AppError}=require('./errors.cjs');
function validatePreferences(changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new AppError('operationFailed');
 for(const [key,allowed]of Object.entries({mode:['apps','system'],language:['fa','en'],theme:['dark','light']})){
  if(changes[key]!==undefined&&!allowed.includes(changes[key]))throw new AppError(key==='mode'?'invalidMode':'operationFailed');
 }
 if(changes.killSwitch!==undefined&&typeof changes.killSwitch!=='boolean')throw new AppError('operationFailed');
}
module.exports={validatePreferences};
