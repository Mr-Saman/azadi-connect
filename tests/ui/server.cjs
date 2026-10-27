'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
async function startUiServer(directory){
 const root=await fs.realpath(directory);
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=await fs.realpath(path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
module.exports={startUiServer};
