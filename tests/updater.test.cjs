const {test}=require('node:test'),assert=require('node:assert/strict');
const {Updater,newer,releaseInfo,checksum}=require('../app/lib/updater.cjs');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const bytes=Buffer.from('synthetic installer'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
function release(){const v='0.5.0';return{tag_name:'v'+v,assets:[{name:'Azadi-Connect-'+v+'-Windows-x64-Setup.exe',size:bytes.length},{name:'SHA256SUMS.txt',size:150}].map(a=>({...a,browser_download_url:'https://github.com/Mr-Saman/azadi-connect/releases/download/v'+v+'/'+a.name}))};}
test('release selection rejects external assets and compares versions numerically',()=>{
 assert.ok(newer('0.10.0','0.9.0'));assert.equal(newer('0.4.1','0.4.1'),false);
 const r=release();assert.equal(releaseInfo(r,'0.4.1').version,'0.5.0');
 r.assets[0].browser_download_url='https://example.com/setup.exe';assert.throws(()=>releaseInfo(r,'0.4.1'));
 assert.throws(()=>checksum(hash+'  a.exe\n'+hash+'  a.exe','a.exe'));
});
test('download verifies exact bytes and rechecks before execution',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const r=release();const updater=new Updater('0.4.1',dir,async url=>new Response(url.endsWith('/latest')?JSON.stringify(r):url.endsWith('.txt')?hash+'  '+r.assets[0].name:bytes));
 await updater.run('check');await updater.run('download');const file=await updater.verifiedFile();assert.deepEqual(await fs.readFile(file),bytes);
 await fs.writeFile(file,'tampered');await assert.rejects(updater.verifiedFile(),{code:'updateIntegrity'});
});
test('checksum mismatch removes partial installer and never marks update ready',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'azadi-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const r=release();const updater=new Updater('0.4.1',dir,async url=>new Response(url.endsWith('/latest')?JSON.stringify(r):url.endsWith('.txt')?'0'.repeat(64)+'  '+r.assets[0].name:bytes));
 await updater.run('check');await assert.rejects(updater.run('download'),{code:'updateIntegrity'});assert.deepEqual(await fs.readdir(dir),[]);
});
