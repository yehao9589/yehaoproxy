export const ATTENTION_EXPIRY_DAYS = 7;

export type AttentionKey = "provision" | "review" | "expiring" | "tickets";
export type AttentionCounts = Partial<Record<AttentionKey, number | null>>;

type AttentionOrder = {
  product: string;
  status: string;
  durationDays: number;
  adminNote: string | null;
  expiresAt: Date | string | null;
};

/** Expired services are not upcoming renewals; count each IP or node separately. */
export function isAttentionExpiry(expiresAt: Date | string | null, now = Date.now()) {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  return expires > now && expires <= now + ATTENTION_EXPIRY_DAYS * 86400000;
}

export function summarizeAttentionOrders(rows: AttentionOrder[], now = Date.now()) {
  let provision = 0, review = 0, expiringNodes = 0;
  for (const row of rows) {
    if (["wallet-topup", "cart-bundle"].includes(row.product)) continue;
    const note = row.adminNote || "";
    const renewal = note.includes("[RENEWAL_OF]");
    if (renewal) {
      if (["paid", "provisioning"].includes(row.status) ||
          (row.status === "active" && !note.includes("[RENEWAL_VERIFIED_AT]"))) review++;
      continue;
    }
    if (row.durationDays > 0 && !note.includes("[BILLING_MODE]one-time") &&
        ["paid", "provisioning"].includes(row.status)) provision++;
    if (row.status === "active" && ["computer-node", "soft-router"].includes(row.product) &&
        isAttentionExpiry(row.expiresAt, now)) expiringNodes++;
  }
  return {provision, review, expiringNodes};
}
