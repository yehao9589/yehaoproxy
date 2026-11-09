export function r2Destination(input = {}) {
  const accountId = String(input.accountId || '').trim().toLowerCase();
  const bucket = String(input.bucket || '').trim();
  const prefix = String(input.prefix || 'yehaoproxy/vps').trim().replace(/^\/+|\/+$/g, '');
  const jurisdiction = String(input.jurisdiction || 'default');
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('请输入 32 位 Cloudflare Account ID');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('存储桶名称须为 3–63 位小写字母、数字或短横线');
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix) || prefix.length > 120) throw new Error('目录前缀仅支持字母、数字、短横线、下划线和分隔斜线');
  if (!['default', 'eu', 'us', 'fedramp'].includes(jurisdiction)) throw new Error('R2 存储区域无效');
  return {accountId, bucket, prefix, jurisdiction};
}
