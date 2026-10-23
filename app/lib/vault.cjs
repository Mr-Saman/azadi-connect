'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { AppError } = require('./errors.cjs');
function systemExe(name) {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', name);
}
async function lockDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') return;
  const { stdout } = await exec(systemExe('whoami.exe'), ['/user','/fo','csv','/nh'], { windowsHide: true, timeout: 10000 });
  const sid = stdout.match(/S-1-5-(?:\d+-)*\d+/)?.[0]; if (!sid) throw new AppError('storageError');
  await exec(systemExe('icacls.exe'), [directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, timeout: 10000 });
}
class Vault {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; this.filename = path.join(directory,'profiles.vault'); }
  async initialize() { await lockDirectory(this.directory); }
  async read() {
    let bytes; try { bytes = await fs.readFile(this.filename); } catch (e) { if (e.code === 'ENOENT') return { profiles: [], apps: [], language: 'fa', mode: 'apps' }; throw new AppError('storageError'); }
    try { return JSON.parse(this.encryption.decryptString(bytes)); } catch { throw new AppError('vaultLocked'); }
  }
  async write(data) {
    if (!this.encryption.isEncryptionAvailable()) throw new AppError('encryptionUnavailable');
    const bytes = this.encryption.encryptString(JSON.stringify(data));
    const temporary = this.filename + '.new';
    await fs.writeFile(temporary, bytes, { mode: 0o600 }); await fs.rename(temporary,this.filename);
  }
}
module.exports = { Vault, lockDirectory, systemExe };
