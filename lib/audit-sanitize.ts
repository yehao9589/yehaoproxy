const sensitiveKey = /(?:password|passwd|secret|token|credential|private.?key|public.?key|authorization|cookie|api.?key|webhook)/i;
const safeIndicatorKey = /(?:changed|updated|configured|enabled|revoked|count)$/i;
function shouldRedact(key:string){return sensitiveKey.test(key)&&!safeIndicatorKey.test(key)}

function clean(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[内容过深，已省略]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [key, shouldRedact(key) ? "[已脱敏]" : clean(item, depth + 1)]));
  }
  return String(value);
}

export function sanitizeAuditDetail(value: unknown) {
  return clean(value ?? {});
}
