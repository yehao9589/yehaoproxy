export type ServiceExpiryState = "active" | "expiring" | "expired" | "unknown";
export type ServiceExpiryDisplay = {state:ServiceExpiryState; label:string; remaining:string};
const HOUR = 3600000;
const DAY = 24 * HOUR;
export const SERVICE_EXPIRING_HOURS = 48;

/** Display only: do not alter entitlement, retention, or renewal policies. */
export function serviceExpiryDisplay(expiresAt:string|null, now=Date.now()):ServiceExpiryDisplay {
  const expires = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(expires)) return {state:"unknown",label:"未设到期",remaining:"请补充到期时间"};
  const delta = expires - now;
  if (delta <= 0) {
    const elapsed = -delta;
    return {state:"expired",label:"已到期",remaining:elapsed < HOUR ? "到期不足 1 小时" : elapsed < DAY ? `已到期 ${Math.floor(elapsed/HOUR)} 小时` : `已到期 ${Math.floor(elapsed/DAY)} 天`};
  }
  if (delta <= SERVICE_EXPIRING_HOURS * HOUR) {
    return {state:"expiring",label:"即将到期",remaining:delta < HOUR ? `剩余 ${Math.max(1,Math.ceil(delta/60000))} 分钟` : `剩余 ${Math.ceil(delta/HOUR)} 小时`};
  }
  return {state:"active",label:"正常",remaining:`剩余 ${Math.ceil(delta/DAY)} 天`};
}

export function serviceExpiryTime(expiresAt:string|null) {
  const value = expiresAt ? new Date(expiresAt) : null;
  if (!value || !Number.isFinite(value.getTime())) return null;
  return {
    date:new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(value),
    time:new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false}).format(value),
  };
}
