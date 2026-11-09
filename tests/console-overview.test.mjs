import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOverviewServices, overviewCounts, serviceStatus } from "../app/dashboard/console-overview-data.ts";
import { isCustomerNodeService } from "../lib/customer-node-service.ts";

const now = Date.parse("2026-11-05T00:00:00.000Z");
const day = 86400000;
const date = days => new Date(now + days * day).toISOString();
const policy = { graceDays: 7, archiveDays: 30 };
const proxy = (id, days = 20, extra = {}) => ({ id, orderId: `order-${id}`, product: "static-residential", host: "192.0.2.1", port: 443, region: "GB", wifiName: "Office", note: "Customer note", city: "London", expiresAt: date(days), ...extra });
const order = (id, extra = {}) => ({ id, product: "computer-node", region: "GLOBAL", quantity: 1, durationDays: 30, amount: 20, status: "active", expiresAt: date(20), ...extra });

test("customer effective services include original active node services and exclude renewals or topups", () => {
  const services = buildOverviewServices([proxy("a"), proxy("b", 3), proxy("c", -1)], [order("node"), order("renewal", { renewalOf: "node" }), order("awaiting", { status: "paid" }), order("unpaid", { status: "pending" }), order("refunded", { status: "refunded" }), order("topup", { product: "wallet-topup" })], policy, now);
  const counts = overviewCounts(services, [order("unpaid", { status: "pending", amount: 35 }), order("topup", { product: "wallet-topup", status: "pending", amount: 99 })]);
  assert.equal(counts.active, 3);
  assert.equal(counts.activeProxies, 2);
  assert.equal(counts.activeNodes, 1);
  assert.equal(counts.expiring, 1);
  assert.equal(counts.unpaid, 1);
  assert.equal(counts.unpaidAmount, 35);
  assert.equal(services.find(row => row.key === "node:awaiting")?.status, "provisioning");
  assert.equal(services.some(row => /renewal|unpaid|refunded|topup/.test(row.key)), false);
});

test("customer node cards and overview classify only paid original node services",()=>{
  const nodes=[order("active"),order("paid",{product:"soft-router",status:"paid"}),order("provisioning",{status:"provisioning"}),
    order("refunded",{status:"refunded",expiresAt:null}),order("cancelled",{status:"failed"}),order("unpaid",{status:"pending"}),
    order("renewal",{renewalOf:"active"}),order("bundle",{bundleRenewal:true}),order("reset",{product:"node-traffic-reset"})];
  assert.deepEqual(nodes.filter(isCustomerNodeService).map(row=>row.id),["active","paid","provisioning"]);
  assert.deepEqual(buildOverviewServices([],nodes,policy,now).map(row=>row.key),["node:active","node:paid","node:provisioning"]);
});

test("expiry is truthful immediately while grace and archive classifications match service management", () => {
  const services = buildOverviewServices([proxy("recent", -1), proxy("grace-edge", -7), proxy("old", -8), proxy("archive-edge", -30), proxy("archived", -31)], [order("old-node", { expiresAt: date(-8) }), order("archived-node", { expiresAt: date(-31) })], policy, now);
  assert.equal(services.find(row => row.key === "proxy:recent")?.status, "expired");
  assert.equal(services.find(row => row.key === "proxy:recent")?.movedToExpired, false);
  assert.equal(services.find(row => row.key === "proxy:grace-edge")?.movedToExpired, false);
  assert.equal(services.find(row => row.key === "proxy:old")?.movedToExpired, true);
  assert.equal(services.find(row => row.key === "proxy:archive-edge")?.movedToExpired, true);
  assert.equal(services.find(row => row.key === "node:old-node")?.status, "expired");
  assert.equal(services.find(row => row.key === "proxy:archive-edge")?.renewalClosed, false);
  for(const key of ["proxy:archived","node:archived-node"]){
    const service=services.find(row=>row.key===key);
    assert.equal(service?.status,"expired");
    assert.equal(service?.movedToExpired,true);
    assert.equal(service?.renewalClosed,true);
  }
  assert.equal(overviewCounts(services, []).active, 0);
});

test("paid pending proxy rows use only remaining allocations and never manufacture recharge services", () => {
  const services = buildOverviewServices([proxy("allocated", 20, { orderId: "proxy-order" })], [order("proxy-order", { product: "static-residential", status: "paid", quantity: 3 }), order("topup", { product: "wallet-topup", status: "paid", quantity: 20 }), order("replacement", { product: "ip-replacement", status: "paid" }), order("reset", { product: "node-traffic-reset", status: "paid" })], policy, now);
  assert.equal(services.length, 3);
  assert.equal(services.filter(row => row.status === "provisioning").length, 2);
  assert.equal(overviewCounts(services, []).active, 1);
});

test("service projection preserves separate WiFi, region and note but excludes backend metadata and credentials", () => {
  const services = buildOverviewServices([proxy("safe", 20, { username: "secret-user", password: "secret-pass", backendVpsName: "private-vps" })], [order("node", { customerNote: "Home router", backendVpsName: "private-node", subscriptionUrl: "https://secret.example" })], policy, now);
  assert.equal(services[0].wifiName, "Office");
  assert.equal(services[0].region, "GB");
  assert.equal(services[0].city, "London");
  assert.equal(services[0].note, "Customer note");
  assert.equal(services[1].note, "Home router");
  assert.equal(/secret|private-vps|private-node/.test(JSON.stringify(services)), false);
});

test("seven-day expiry threshold is inclusive and perpetual service is active", () => {
  assert.equal(serviceStatus(date(7), now), "expiring");
  assert.equal(serviceStatus(date(7.01), now), "active");
  assert.equal(serviceStatus(date(0), now), "expired");
  assert.equal(serviceStatus(null, now), "active");
});

test("unpaid amounts remain separated by original order currency", () => {
  const counts = overviewCounts([], [order("cny", { status: "pending", amount: 35, currency: "CNY" }), order("usd", { status: "pending", amount: 10, currency: "USD" })]);
  assert.equal(counts.unpaid, 2);
  assert.deepEqual(counts.unpaidByCurrency, [{ currency: "CNY", amount: 35 }, { currency: "USD", amount: 10 }]);
});

test("customer overview keeps customer-only reads and delegates service writes to existing service management", async () => {
  const overview = await readFile(new URL("../app/dashboard/ConsoleOverview.tsx", import.meta.url), "utf8");
  assert.match(overview, /dashboardJson[^\n]+\("\/api\/proxies", \{ force \}\)/);
  assert.doesNotMatch(overview, /\/api\/admin|reveal=1|method:\s*["'](?:POST|PATCH|DELETE)["']|encryptedPassword|subscriptionUrl|backendVps/);
  assert.match(overview, /onClick=\{\(\) => setTab\("proxies"\)\}>续费/);
  assert.match(overview, /aria-label="搜索我的服务"/);
  assert.match(overview, /aria-label="筛选国家或地区"/);
  assert.match(overview, /aria-label="筛选服务状态"/);
  assert.match(overview, /<Pagination total=\{visible.length\}/);
  assert.match(overview, /<th scope="col">国家 \/ 地区<\/th><th scope="col">WiFi 名称<\/th><th scope="col">备注<\/th>/);
  assert.doesNotMatch(overview, /流量趋势|流量使用|到期日历|Math\.random/);
});
