import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'native/guardian.c');
const target=path.join(root,'resources/core/guardian.exe');
let command,args;
if(process.platform==='win32') {
  command='cl.exe';args=['/nologo','/O2','/W4','/MT',source,`/Fe:${target}`,'/link','/SUBSYSTEM:CONSOLE','user32.lib'];
} else {
  command=process.env.AZADI_MINGW_CC || 'x86_64-w64-mingw32-gcc';
  args=['-O2','-Wall','-Wextra','-municode','-static',source,'-o',target,'-luser32'];
}
const result=spawnSync(command,args,{stdio:'inherit'});
if(result.error) throw result.error;
if(result.status!==0) throw new Error('Native guardian compilation failed');
const metaPath=path.join(root,'resources/core/integrity.json');
const meta=JSON.parse(await fs.readFile(metaPath,'utf8'));
meta.guardianSha256=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
await fs.writeFile(metaPath,JSON.stringify(meta,null,2)+'\n');
console.log('Compiled Windows guardian; recorded SHA-256');
