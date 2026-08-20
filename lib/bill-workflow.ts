export type BillKind = "purchase" | "renewal" | "after-sales" | "wallet";

type BillLike = {
  product: string;
  durationDays: number;
  status: string;
  adminNote?: string | null;
  serviceRequestStatus?: string | null;
  renewalVerified?: boolean;
};

export function billKind(order: BillLike): BillKind {
  const note = String(order.adminNote || "");
  if (note.includes("[RENEWAL_OF]") || note.includes("[BUNDLE_RENEWAL]true")) return "renewal";
  if (["ip-replacement", "node-traffic-reset"].includes(order.product) || (order.durationDays === 0 && !["wallet-topup", "cart-bundle"].includes(order.product))) return "after-sales";
  if (order.product === "wallet-topup") return "wallet";
  return "purchase";
}

export const billKindNames: Record<BillKind, string> = {
  purchase: "新购服务",
  renewal: "服务续费",
  "after-sales": "一次性售后",
  wallet: "余额充值",
};

export function financialStatus(order: BillLike) {
  if (order.status === "pending") return "待付款";
  if (order.status === "refunded") return "已退款";
  if (["failed", "cancelled", "canceled"].includes(order.status)) return "已关闭";
  return "已付款";
}

export function businessProgress(order: BillLike) {
  const kind = billKind(order);
  if (order.status === "pending") return "等待客户付款";
  if (order.status === "refunded") return "退款已完成";
  if (["failed", "cancelled", "canceled"].includes(order.status)) return "账单已关闭";
  if (kind === "renewal") {
    if (order.renewalVerified || String(order.adminNote || "").includes("[RENEWAL_VERIFIED_AT]")) return "续费核验完成";
    if (order.status === "active") return "续费已生效 · 待核验";
    return "付款已确认 · 待核验";
  }
  if (kind === "after-sales") {
    if (order.serviceRequestStatus === "rejected") return "售后已拒绝";
    if (order.serviceRequestStatus === "cancelled") return "售后已取消";
    if (order.status === "active") return "售后已完成";
    return "等待售后处理";
  }
  if (kind === "wallet") return order.status === "active" ? "余额已到账" : "充值处理中";
  if (order.status === "active") return "服务已交付";
  return "等待产品交付";
}

export function billActionName(order: BillLike) {
  if (order.status === "pending") return "查看 / 修改账单";
  const kind = billKind(order);
  if (kind === "renewal") return "查看续费账单";
  if (kind === "after-sales") return "查看售后进度";
  return "查看账单详情";
}
