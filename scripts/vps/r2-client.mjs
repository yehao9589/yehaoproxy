import fs from 'node:fs';
import {createHash, createHmac} from 'node:crypto';
import {finished} from 'node:stream/promises';
import {r2Destination} from './r2-config.mjs';
export {r2Destination} from './r2-config.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const uri = value => encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());

/** SigV4 signs the exact encoded object path and payload, with R2's auto region. */
export function signedR2Request(config, method, objectKey = '', payloadHash = digest(''), headers = {}, now = new Date()) {
  const destination = r2Destination(config);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(config.accessKeyId || '') || !/^[^\s]{32,256}$/.test(config.secretAccessKey || '')) throw new Error('请先保存有效的 R2 Access Key ID 和 Secret Access Key');
  const regionPart = destination.jurisdiction === 'default' ? '' : `.${destination.jurisdiction}`;
  const host = `${destination.accountId}${regionPart}.r2.cloudflarestorage.com`;
  const pathname = '/' + [destination.bucket, ...objectKey.split('/').filter(Boolean)].map(uri).join('/');
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8);
  const values = Object.fromEntries(Object.entries({...headers, host, 'x-amz-date': date, 'x-amz-content-sha256': payloadHash}).map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')]));
  const keys = Object.keys(values).sort(), signedHeaders = keys.join(';');
  const canonical = `${method}\n${pathname}\n\n${keys.map(key => `${key}:${values[key]}\n`).join('')}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + config.secretAccessKey, day), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${digest(canonical)}`).toString('hex');
  return {url: `https://${host}${pathname}`, headers: {...values, authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`}};
}

function r2Error(status) {
  if (status === 403 || status === 401) return new Error('R2 拒绝访问，请检查访问密钥、存储桶范围、权限和服务器时间');
  if (status === 404) return new Error('R2 存储桶或对象不存在，请检查账号、区域和存储桶名称');
  if (status === 412) return new Error('R2 对象已存在，已阻止覆盖；请核对云端记录');
  if (status === 429) return new Error('R2 请求频率受限，请稍后重试');
  return new Error(`R2 请求失败（HTTP ${status}），请检查配置及网络`);
}

export class R2BackupClient {
  constructor(config, options = {}) { this.config = config; this.fetch = options.fetchImpl || fetch; this.now = options.now || (() => new Date()); }
  async request(method, key = '', file) {
    const headers = file ? {'content-type': 'application/octet-stream', 'content-length': String(file.bytes), 'content-md5': file.md5, 'x-amz-meta-sha256': file.sha256, 'x-amz-storage-class': 'STANDARD', 'if-none-match': '*'} : {};
    const request = signedR2Request(this.config, method, key, file?.sha256, headers, this.now());
    const stream = file ? fs.createReadStream(file.filename) : null;
    const streamClosed = stream ? finished(stream).catch(() => {}) : Promise.resolve();
    let response;
    try {
      response = await this.fetch(request.url, {method, headers: request.headers, body: stream || undefined, ...(stream ? {duplex: 'half'} : {}), redirect: 'manual', signal: AbortSignal.timeout(file ? 600000 : 20000)});
    } catch { throw new Error('R2 连接失败或超时，请检查网络；本地备份仍保留'); }
    finally { stream?.destroy(); await streamClosed; }
    if (!response.ok) { await response.body?.cancel(); throw r2Error(response.status); }
    return response;
  }
  async test() { const response = await this.request('HEAD'); await response.body?.cancel(); return {ok: true, message: '存储桶可访问；检测未上传文件，写入权限将在首次上传时验证'}; }
  async upload(key, file) {
    const response = await this.request('PUT', key, file); await response.body?.cancel();
    const head = await this.request('HEAD', key);
    const valid = Number(head.headers.get('content-length')) === file.bytes && head.headers.get('x-amz-meta-sha256') === file.sha256;
    await head.body?.cancel();
    if (!valid) throw new Error('R2 上传后的大小或校验信息不一致，请保留本地备份并重试');
    return {bytes: file.bytes, sha256: file.sha256};
  }
}
