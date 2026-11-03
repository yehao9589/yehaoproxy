export type WifiNameSuggestion = {
  previousName: string | null;
  suggestedName: string | null;
};

export type WifiNameConflict = { id: string; orderId: string; wifiName: string | null; address: string; status: string };

export function normalizeWifiName(value: string | null | undefined) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

/** Compare the complete name, not descriptive code fragments; ignore the IP being edited. */
export function duplicateWifiNames<T extends { id: string; wifiName: string | null }>(
  items: readonly T[], name: string | null, excludeAllocationId?: string,
) {
  const normalized = normalizeWifiName(name);
  return normalized ? items.filter(item => item.id !== excludeAllocationId && normalizeWifiName(item.wifiName) === normalized) : [];
}

export function wifiNameDuplicateMessage(name: string | null, count: number) {
  return count ? `该客户已有 ${count} 个其他服务使用 WiFi 名称“${String(name || "").trim()}”，请注意区分。` : null;
}

type WifiNameHistory = {
  id: string;
  wifiName: string | null;
  note?: string | null;
  createdAt: Date | string | number;
};

function sequence(value: string) {
  // Ignore descriptive text around a code, e.g. “电脑 UK18-直播” -> UK18.
  const match = value.match(/([A-Za-z]+)(\d+)/) || value.match(/^(\d+)$/);
  if (!match) return null;
  const prefix = match.length === 3 ? match[1] : "";
  const digits = match.length === 3 ? match[2] : match[1];
  return { prefix, digits, number: BigInt(digits) };
}

function deliveredAt(item: WifiNameHistory) {
  const activation = item.note?.match(/^\[ACTIVATED_AT\]([^\r\n]+)/m)?.[1];
  const activatedAt = activation ? new Date(activation).getTime() : NaN;
  const createdAt = new Date(item.createdAt).getTime();
  return Number.isFinite(activatedAt) ? activatedAt : Number.isFinite(createdAt) ? createdAt : 0;
}

/** History must already be scoped to one customer, product and country. */
export function suggestWifiName(history: readonly WifiNameHistory[]): WifiNameSuggestion {
  const named = history.filter(item => item.wifiName?.trim()).slice().sort((a, b) => {
    const time = deliveredAt(b) - deliveredAt(a);
    if (time) return time;
    return b.id.localeCompare(a.id);
  });
  let latest = named[0];
  const latestCode = latest?.wifiName ? sequence(latest.wifiName.trim()) : null;
  // Legacy batches share an order timestamp. Resolve ties within the selected
  // series by its highest number; do not infer creation order from UUIDs.
  if (latestCode) {
    const latestTime = deliveredAt(latest);
    for (const item of named) {
      if (deliveredAt(item) !== latestTime) break;
      const code = sequence(item.wifiName!.trim());
      const current = sequence(latest.wifiName!.trim())!;
      if (code && code.prefix.toLowerCase() === latestCode.prefix.toLowerCase() && code.number > current.number) latest = item;
    }
  }
  const previousName = latest?.wifiName?.trim() || null;
  const previous = previousName ? sequence(previousName) : null;
  if (!previous) return { previousName, suggestedName: null };
  const used = new Set(named.map(item => sequence(item.wifiName!.trim()))
    .filter(item => item && item.prefix.toLowerCase() === previous.prefix.toLowerCase())
    .map(item => item!.number.toString()));
  let next = previous.number + BigInt(1);
  while (used.has(next.toString())) next += BigInt(1);
  return {
    previousName,
    suggestedName: `${previous.prefix}${next.toString().padStart(previous.digits.length, "0")}`,
  };
}
