// YehaoProxy encrypted VPS backup decoder. Node.js 22+, no extra packages.
// Only decrypts local files; never connects to a VPS or cloud service.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createDecipheriv, createHash, randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createGunzip} from 'node:zlib';

const MAX = 300 * 1024 * 1024;
async function readExactly(handle, length, position) { const data = Buffer.alloc(length); const result = await handle.read(data, 0, length, position); if (result.bytesRead !== length) throw new Error('备份文件不完整'); return data; }
export async function decryptArchive(input, recovery, output) {
  const key = String(recovery.encryptionKey || ''), keyId = createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex').slice(0, 16);
  if (!/^[a-f0-9]{64}$/i.test(key) || recovery.format !== 'YehaoProxy-R2-Recovery-Key') throw new Error('解密密钥文件无效');
  const handle = await fs.promises.open(input, 'r'), temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yehao-decrypt-'));
  const payload = path.join(temporary, 'payload'); let staging = '';
  try {
    const stat = await handle.stat(); if (stat.size > MAX || stat.size < 40) throw new Error('备份文件大小无效');
    const prefix = await readExactly(handle, 12, 0); if (prefix.subarray(0, 8).toString() !== 'YHBAK001') throw new Error('不是支持的 YehaoProxy 加密备份');
    const length = prefix.readUInt32BE(8); if (length > 4096 || length < 10 || stat.size <= 12 + length + 16) throw new Error('加密备份头无效');
    const raw = await readExactly(handle, length, 12), header = JSON.parse(raw.toString('utf8'));
    if (header.version !== 1 || header.cipher !== 'AES-256-GCM' || header.compression !== 'gzip' || header.keyId !== keyId) throw new Error('备份版本不支持或解密密钥不匹配');
    const iv = Buffer.from(header.iv || '', 'base64'); if (iv.length !== 12) throw new Error('加密参数无效');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    decipher.setAAD(Buffer.concat([prefix, raw])); decipher.setAuthTag(await readExactly(handle, 16, stat.size - 16));
    let bytes = 0;
    const limit = new Transform({transform(chunk, _, callback) { bytes += chunk.length; callback(bytes > MAX ? new Error('解压数据超过安全上限') : null, chunk); }});
    // Authentication must complete before any output files are extracted.
    await pipeline(fs.createReadStream(input, {start: 12 + length, end: stat.size - 17}), decipher, createGunzip(), limit, fs.createWriteStream(payload, {flags: 'wx', mode: 0o600}));
    const data = await fs.promises.open(payload, 'r');
    try {
      const manifestLength = (await readExactly(data, 4, 0)).readUInt32BE(0); if (manifestLength > 65536) throw new Error('文件清单过大');
      const manifest = JSON.parse((await readExactly(data, manifestLength, 4)).toString('utf8'));
      if (manifest.format !== 'YehaoProxy-VPS' || manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 2) throw new Error('备份文件清单无效');
      const target = path.resolve(output); if (fs.existsSync(target)) throw new Error('输出目录已存在，请选择一个新的目录，避免覆盖文件');
      await fs.promises.mkdir(path.dirname(target), {recursive: true}); staging = path.join(path.dirname(target), `.yehao-${randomUUID()}`); await fs.promises.mkdir(staging, {mode: 0o700});
      let offset = 4 + manifestLength; const names = new Set();
      for (const file of manifest.files) {
        if (typeof file.name !== 'string' || !file.name || file.name !== path.basename(file.name) || /[\\/:\x00-\x1f]/.test(file.name) || file.name === '.' || file.name === '..' || names.has(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX || offset + file.bytes > bytes) throw new Error('备份清单包含无效文件');
        names.add(file.name); const hash = createHash('sha256');
        const hashStream = new Transform({transform(chunk, _, callback) { hash.update(chunk); callback(null, chunk); }});
        await pipeline(fs.createReadStream(payload, {start: offset, end: offset + file.bytes - 1}), hashStream, fs.createWriteStream(path.join(staging, file.name), {flags: 'wx', mode: 0o600}));
        if (hash.digest('hex') !== file.sha256) throw new Error('解密文件校验失败'); offset += file.bytes;
      }
      if (offset !== bytes) throw new Error('备份长度与文件清单不一致');
      await fs.promises.rename(staging, target); staging = ''; return {directory: target, files: manifest.files.map(file => file.name)};
    } finally { await data.close(); }
  } finally { await handle.close(); if (staging) await fs.promises.rm(staging, {recursive: true, force: true}); await fs.promises.rm(temporary, {recursive: true, force: true}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, keyFile, output] = process.argv.slice(2);
  if (!input || !keyFile || !output) { console.error('用法：node yehaoproxy-decrypt-backup.mjs 备份.yhbackup 解密密钥.json 新输出目录'); process.exitCode = 1; }
  else try { const result = await decryptArchive(input, JSON.parse(await fs.promises.readFile(keyFile, 'utf8')), output); console.log(`解密完成：${result.directory}\n${result.files.join('\n')}`); }
  catch { console.error('解密失败：请检查备份完整性、密钥是否匹配及输出目录权限。原备份不会被修改。'); process.exitCode = 1; }
}
