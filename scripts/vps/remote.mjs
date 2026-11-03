import { open, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { totp } from './totp.mjs';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0');

export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error('请输入有效的面板完整访问地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('面板地址仅支持 HTTP/HTTPS，不能包含账号、查询参数或锚点');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

async function readLimited(response, max) {
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel();
    throw new Error('面板响应超过允许大小');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.length;
    if (bytes > max) throw new Error('面板响应超过允许大小');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class RemoteClient {
  constructor(panel, credentials, options = {}) {
    this.baseUrl = normalizeBaseUrl(panel.baseUrl);
    this.credentials = credentials;
    this.cookies = new Map();
    this.fetch = options.fetchImpl || globalThis.fetch;
    this.timeout = options.timeout ?? 45_000;
    this.maxBackupBytes = options.maxBackupBytes ?? 256 * 1024 * 1024;
    this.now = options.now || Date.now;
    this.pendingLogin = null;
  }

  async raw(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    let response;
    try {
      response = await this.fetch(new URL(path, this.baseUrl), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(this.timeout) });
    } catch (error) {
      throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError'
        ? '连接面板超时，请检查网络与面板地址'
        : '无法连接面板，请检查地址、网络与 HTTPS 证书');
    }
    for (const cookie of response.headers.getSetCookie?.() || []) {
      const pair = cookie.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) {
        const name = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (value) this.cookies.set(name, value); else this.cookies.delete(name);
      }
    }
    return response;
  }

  async login() {
    if (this.pendingLogin) return this.pendingLogin;
    this.pendingLogin = (async () => {
      this.cookies.clear();
      const form = new URLSearchParams({ username: this.credentials.username, password: this.credentials.password });
      if (this.credentials.totpSecret) form.set('twoFactorCode', totp(this.credentials.totpSecret, this.now()));
      const response = await this.raw('login', { method: 'POST', body: form });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`面板登录失败（HTTP ${response.status}）`); }
      let body;
      try { body = JSON.parse((await readLimited(response, 1024 * 1024)).toString('utf8')); }
      catch { throw new Error('登录接口未返回有效 JSON，请确认完整面板访问路径'); }
      if (body.success !== true || !this.cookies.size) {
        this.cookies.clear();
        throw new Error('面板登录失败，请检查用户名、密码与两步验证配置');
      }
    })();
    try { await this.pendingLogin; } finally { this.pendingLogin = null; }
  }

  async authenticated(path) {
    if (!this.cookies.size) await this.login();
    let response = await this.raw(path);
    if (response.status === 401) {
      await response.body?.cancel();
      await this.login();
      response = await this.raw(path);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 401 ? '面板会话失效，重新登录后仍未获得权限' : `面板接口返回 HTTP ${response.status}，请检查访问路径与版本兼容性`);
    }
    return response;
  }

  async json(path, max = 2 * 1024 * 1024) {
    const response = await this.authenticated(path);
    let body;
    try { body = JSON.parse((await readLimited(response, max)).toString('utf8')); }
    catch { throw new Error('面板接口未返回有效 JSON，请检查访问路径与版本兼容性'); }
    if (body.success !== true) throw new Error('面板接口报告失败，请检查面板运行状态与账号权限');
    return body.obj;
  }

  status() { return this.json('panel/api/server/status'); }

  async configuration() {
    let configuration = await this.json('panel/api/server/getConfigJson', 16 * 1024 * 1024);
    if (typeof configuration === 'string') {
      try { configuration = JSON.parse(configuration); } catch { throw new Error('Xray 配置格式无效'); }
    }
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Xray 配置内容为空或格式无效');
    return configuration;
  }

  async downloadDatabase(filename) {
    const response = await this.authenticated('panel/api/server/getDb');
    if (Number(response.headers.get('content-length')) > this.maxBackupBytes) {
      await response.body?.cancel();
      throw new Error('数据库备份超过 256 MB 限制');
    }
    const file = await open(filename, 'wx', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    let prefix = Buffer.alloc(0);
    try {
      for await (const chunk of response.body || []) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > this.maxBackupBytes) throw new Error('数据库备份超过允许大小');
        if (prefix.length < SQLITE_HEADER.length) prefix = Buffer.concat([prefix, buffer]).subarray(0, SQLITE_HEADER.length);
        if (prefix.length === SQLITE_HEADER.length && !prefix.equals(SQLITE_HEADER)) throw new Error('返回内容不是 SQLite 数据库，可能是登录页或接口错误');
        hash.update(buffer);
        await file.writeFile(buffer);
      }
      if (bytes < 100 || !prefix.equals(SQLITE_HEADER)) throw new Error('数据库备份为空或不完整');
      await file.sync();
      await file.close();
      return { bytes, sha256: hash.digest('hex') };
    } catch (error) {
      await file.close().catch(() => {});
      await rm(filename, { force: true });
      throw error;
    }
  }
}
