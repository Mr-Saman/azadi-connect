'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const PE=require('pe-library');const RE=require('resedit');
 const file=path.join(context.appOutDir,'Azadi Connect.exe');
 const exe=PE.NtExecutable.from(await fs.readFile(file),{ignoreCert:true});
 const res=PE.NtExecutableResource.from(exe);
 const icons=RE.Data.IconFile.from(await fs.readFile(path.join(context.packager.projectDir,'build/icon.ico')));
 for(const group of RE.Resource.IconGroupEntry.fromEntries(res.entries))RE.Resource.IconGroupEntry.replaceIconsForResource(res.entries,group.id,group.lang,icons.icons.map(i=>i.data));
 const version=RE.Resource.VersionInfo.fromEntries(res.entries)[0] || RE.Resource.VersionInfo.createEmpty();
 version.setFileVersion(context.packager.appInfo.version,1033);version.setProductVersion(context.packager.appInfo.version,1033);
 version.setStringValues({lang:1033,codepage:1200},{FileDescription:'Azadi Connect — For Iran',ProductName:'Azadi Connect',CompanyName:'Azadi Connect contributors',OriginalFilename:'Azadi Connect.exe',LegalCopyright:'Copyright © 2026 Azadi Connect contributors'});
 version.outputToResourceEntries(res.entries);
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity version="'+context.packager.appInfo.version+'.0" processorArchitecture="amd64" name="Azadi.Connect" type="win32"/><description>Azadi Connect</description><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="requireAdministrator" uiAccess="false"/></requestedPrivileges></security></trustInfo><compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility><application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings></application></assembly>';
 res.entries=res.entries.filter(e=>e.type!==24);
 res.entries.push({type:24,id:1,lang:1033,codepage:65001,bin:Buffer.from(xml,'utf8')});
 res.outputResource(exe);await fs.writeFile(file,Buffer.from(exe.generate()));
 const all=[];const dirs=[];
 async function walk(directory){for(const item of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,item.name);if(item.isDirectory()){await walk(full);dirs.push(path.relative(context.appOutDir,full));}else all.push(path.relative(context.appOutDir,full));}}
 await walk(context.appOutDir);
 const quote=value=>value.replace(/\\/g,'/').replace(/\$/g,'$$').replace(/"/g,'$\\"').replace(/\//g,'\\');
 const lines=['; Generated from the packaged file list. Never delete unrelated files.','!macro RemoveAzadiFiles',...all.map(f=>`  Delete "$INSTDIR\\${quote(f)}"`),...dirs.map(d=>`  RMDir "$INSTDIR\\${quote(d)}"`),'!macroend',''];
 await fs.writeFile(path.join(context.packager.projectDir,'build/uninstall-files.nsh'),lines.join('\n'));
 console.log('Applied Azadi branding, local icon, version and Administrator manifest');
};
