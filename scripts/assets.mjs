import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version='1.14.3';
const name=`sing-box-${version}-windows-amd64.zip`;
const expected='d8b86ef58936dba9230ec6a57ffa4243933f3c14ef4809828b6c553440ed1518';
const directory=path.join(root,'resources/core');
await fs.mkdir(directory,{recursive:true});
let archive;
const cache=path.join(root,'.cache',name); await fs.mkdir(path.dirname(cache),{recursive:true});
try { archive=await fs.readFile(cache); } catch {
 const response=await fetch(`https://github.com/SagerNet/sing-box/releases/download/v${version}/${name}`);
 if(!response.ok) throw new Error(`Official core download failed: ${response.status}`);
 archive=Buffer.from(await response.arrayBuffer());
}
if(crypto.createHash('sha256').update(archive).digest('hex')!==expected) throw new Error('Core archive SHA-256 mismatch');
await fs.writeFile(cache,archive);
const files=unzipSync(archive);
const entry=Object.entries(files).find(([p])=>p.endsWith('/sing-box.exe')||p==='sing-box.exe');
if(!entry) throw new Error('Official core archive is missing sing-box.exe');
await fs.writeFile(path.join(directory,'sing-box.exe'),entry[1]);
for(const [p,bytes] of Object.entries(files)) if(/\.(dll|txt|md)$/i.test(p) || /LICENSE/.test(p)) await fs.writeFile(path.join(directory,path.basename(p)),bytes);
await fs.writeFile(path.join(directory,'integrity.json'),JSON.stringify({version,source:`https://github.com/SagerNet/sing-box/tree/v${version}`,archiveSha256:expected,sha256:crypto.createHash('sha256').update(entry[1]).digest('hex')},null,2)+'\n');
console.log(`Verified and staged sing-box ${version} for Windows x64`);
