export const DEFAULT_RENEWAL_CUTOFF_DAYS = 30;
export const RENEWAL_CUTOFF_MESSAGE = "该服务已超过续费期限，请重新购买或联系管理员。";
export const SERVICE_DAY_MS = 86_400_000;

export function renewalCutoffDays(value: unknown) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : DEFAULT_RENEWAL_CUTOFF_DAYS;
}

export function serviceBeyondExpiry(expiresAt: string | Date | null | undefined, days: number, now: number) {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expiry) && now - expiry > days * SERVICE_DAY_MS;
}
