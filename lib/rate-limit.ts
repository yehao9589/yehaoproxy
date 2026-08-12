type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) pruneBuckets(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
