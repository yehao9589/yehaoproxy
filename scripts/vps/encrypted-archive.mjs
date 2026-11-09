import fs from 'node:fs';
import {createCipheriv, createHash, randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {vpsBackupFileName} from './backup-name.mjs';

export const ARCHIVE_MAGIC = Buffer.from('YHBAK001');
export function archiveKeyId(key) { if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('备份加密密钥无效'); return createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex').slice(0, 16); }
async function checksum(filename) {
  const hash = createHash('sha256'), md5 = createHash('md5'); let bytes = 0;
  for await (const chunk of fs.createReadStream(filename)) { hash.update(chunk); md5.update(chunk); bytes += chunk.length; }
  return {bytes, sha256: hash.digest('hex'), md5: md5.digest('base64')};
}

/** Compress and encrypt a self-contained backup; never persist the key or plaintext manifest. */
export async function createEncryptedArchive(backup, files, key, filename) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 2 || files[0].kind !== 'db') throw new Error('备份文件清单无效');
  const keyId = archiveKeyId(key), entries = [];
  for (const file of files) {
    const stat = await fs.promises.lstat(file.filename);
    if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error('待上传的备份文件无效或过大');
    const info = await checksum(file.filename);
    if (file.kind === 'db' && info.sha256 !== backup.sha256) throw new Error('本地数据库校验失败，已停止上传');
    entries.push({name: vpsBackupFileName(backup, file.kind), bytes: info.bytes, sha256: info.sha256});
  }
  if (entries.reduce((sum, file) => sum + file.bytes, 0) > 280 * 1024 * 1024) throw new Error('备份数据超过加密归档上限');
  const manifest = Buffer.from(JSON.stringify({format: 'YehaoProxy-VPS', version: 1, backupId: backup.id, serverName: backup.serverName, createdAt: backup.createdAt, files: entries}));
  const manifestLength = Buffer.alloc(4); manifestLength.writeUInt32BE(manifest.length);
  const iv = randomBytes(12), header = Buffer.from(JSON.stringify({version: 1, cipher: 'AES-256-GCM', compression: 'gzip', keyId, iv: iv.toString('base64')}));
  const headerLength = Buffer.alloc(4); headerLength.writeUInt32BE(header.length);
  const aad = Buffer.concat([ARCHIVE_MAGIC, headerLength, header]);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv); cipher.setAAD(aad);
  async function* source() { yield manifestLength; yield manifest; for (const file of files) yield* fs.createReadStream(file.filename); }
  try {
    await fs.promises.writeFile(filename, aad, {mode: 0o600, flag: 'wx'});
    await pipeline(Readable.from(source()), createGzip(), cipher, fs.createWriteStream(filename, {flags: 'a', mode: 0o600}));
    await fs.promises.appendFile(filename, cipher.getAuthTag());
    return {filename, keyId, ...await checksum(filename)};
  } catch (error) { await fs.promises.rm(filename, {force: true}); throw error; }
}
