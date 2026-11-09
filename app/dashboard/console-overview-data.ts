/** Customer-facing projections only: no infrastructure names, credentials, or traffic figures. */
export type OverviewProxy = {
  id: string;
  orderId: string;
  product?: string;
  host: string;
  port: number;
  wifiName?: string | null;
  region: string;
  countryName?: string | null;
  city?: string | null;
  expiresAt: string | null;
  note?: string | null;
};

export type OverviewOrder = {
  id: string;
  product: string;
  region: string;
  quantity: number;
  durationDays: number;
  amount: number;
  currency?: string;
  status: string;
  expiresAt?: string | null;
  customerNote?: string | null;
  renewalOf?: string | null;
};

export type ExpiryPolicy = { graceDays: number; archiveDays: number };
export type ServiceStatus = "active" | "expiring" | "expired" | "provisioning";
export type OverviewService = {
  key: string;
  kind: "proxy" | "node";
  product: string;
  address: string;
  region: string;
  countryName: string;
  city: string;
  wifiName: string;
  note: string;
  expiresAt: string | null;
  status: ServiceStatus;
  movedToExpired: boolean;
};

const DAY = 86_400_000;
const nodeProducts = new Set(["soft-router", "computer-node"]);
const nonServiceProducts = new Set(["wallet-topup", "node-traffic-reset", "ip-replacement"]);

function expiry(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function serviceStatus(value: string | null | undefined, now: number): ServiceStatus {
  const time = expiry(value);
  if (time === null) return "active";
  if (time <= now) return "expired";
  return time - now <= 7 * DAY ? "expiring" : "active";
}

export function buildOverviewServices(proxies: OverviewProxy[], entitlements: OverviewOrder[], policy: ExpiryPolicy, now: number): OverviewService[] {
  const visible = (value: string | null | undefined) => {
    const time = expiry(value);
    return time === null || now - time <= policy.archiveDays * DAY;
  };
  const moved = (value: string | null | undefined) => {
    const time = expiry(value);
    return time !== null && now - time > policy.graceDays * DAY;
  };
  const rows: OverviewService[] = proxies
    .filter(proxy => visible(proxy.expiresAt) && !nonServiceProducts.has(proxy.product || ""))
    .map(proxy => ({
      key: `proxy:${proxy.id}`,
      kind: "proxy",
      product: proxy.product || "static-residential",
      address: `${proxy.host}:${proxy.port}`,
      region: proxy.region,
      countryName: proxy.countryName || "",
      city: proxy.city || "",
      wifiName: proxy.wifiName || "",
      note: proxy.note || "",
      expiresAt: proxy.expiresAt,
      status: serviceStatus(proxy.expiresAt, now),
      movedToExpired: moved(proxy.expiresAt),
    }));

  const allocationsByOrder = new Map<string, number>();
  for (const proxy of proxies) allocationsByOrder.set(proxy.orderId, (allocationsByOrder.get(proxy.orderId) || 0) + 1);

  for (const order of entitlements) {
    if (nonServiceProducts.has(order.product) || order.renewalOf || !["paid", "provisioning", "active"].includes(order.status)) continue;
    if (nodeProducts.has(order.product)) {
      if (order.status === "active" && !visible(order.expiresAt)) continue;
      const active = order.status === "active";
      rows.push({
        key: `node:${order.id}`,
        kind: "node",
        product: order.product,
        address: "",
        region: order.region,
        countryName: "",
        city: "",
        wifiName: "",
        note: order.customerNote || "",
        expiresAt: active ? order.expiresAt || null : null,
        status: active ? serviceStatus(order.expiresAt, now) : "provisioning",
        movedToExpired: active && moved(order.expiresAt),
      });
      continue;
    }
    if (order.durationDays <= 0 || !["paid", "provisioning"].includes(order.status)) continue;
    const remaining = Math.max(0, order.quantity - (allocationsByOrder.get(order.id) || 0));
    for (let index = 0; index < remaining; index++) {
      rows.push({
        key: `pending:${order.id}:${index}`,
        kind: "proxy",
        product: order.product,
        address: "",
        region: order.region,
        countryName: "",
        city: "",
        wifiName: "",
        note: "",
        expiresAt: null,
        status: "provisioning",
        movedToExpired: false,
      });
    }
  }
  return rows;
}

export function overviewCounts(services: OverviewService[], orders: OverviewOrder[], defaultCurrency = "CNY") {
  const active = services.filter(service => service.status === "active" || service.status === "expiring");
  const unpaid = orders.filter(order => order.product !== "wallet-topup" && order.status === "pending");
  const unpaidByCurrency = new Map<string, number>();
  for (const order of unpaid) {
    const currency = order.currency || defaultCurrency;
    unpaidByCurrency.set(currency, (unpaidByCurrency.get(currency) || 0) + Number(order.amount || 0));
  }
  return {
    active: active.length,
    activeProxies: active.filter(service => service.kind === "proxy").length,
    activeNodes: active.filter(service => service.kind === "node").length,
    expiring: active.filter(service => service.status === "expiring").length,
    unpaid: unpaid.length,
    unpaidAmount: unpaid.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    unpaidByCurrency: [...unpaidByCurrency].map(([currency, amount]) => ({ currency, amount })),
  };
}
