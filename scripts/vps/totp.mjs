import {createHmac} from 'node:crypto';

export function normalizeTotpSecret(value = '') {
  const secret = String(value).replace(/[\s=-]/g, '').toUpperCase();
  if (secret && (!/^[A-Z2-7]+$/.test(secret) || secret.length < 16 || secret.length > 128)) {
    throw new Error('TOTP 密钥应为 16–128 位 Base32 字符');
  }
  return secret;
}

export function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of normalizeTotpSecret(secret)) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
