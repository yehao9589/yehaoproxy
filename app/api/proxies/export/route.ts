import { and, eq } from "drizzle-orm";
import { getCurrentCustomer } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { decryptCredential } from "../../../../lib/inventory-crypto";
import { getDb } from "../../../../db";
import { orders, productOffers, proxyAllocations } from "../../../../db/schema";
import { proxyNoteValue, visibleProxyNote } from "../../../../lib/proxy-note";
import { countryName } from "../../../../lib/countries";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const localTime = (value: Date | null) => value?.toLocaleString("sv-SE", {
  timeZone: "Asia/Shanghai",
  hour12: false,
}) || "";

export async function GET(request: Request) {
  const user = await getCurrentCustomer();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rows = await getDb()
    .select({
      host: proxyAllocations.host,
      port: proxyAllocations.port,
      username: proxyAllocations.username,
      password: proxyAllocations.encryptedPassword,
      protocol: proxyAllocations.protocol,
      note: proxyAllocations.note,
      expiresAt: proxyAllocations.expiresAt,
      region: orders.region,
      regionName: productOffers.regionName,
    })
    .from(proxyAllocations)
    .innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .leftJoin(productOffers, and(eq(productOffers.product, orders.product), eq(productOffers.region, orders.region)))
    .where(and(eq(orders.customerEmail, user.email), eq(proxyAllocations.status, "active")));

  const lines = ["代理地址,端口,账号,密码,协议,国家/地区,城市,备注,到期时间"];
  for (const row of rows) {
    lines.push([
      row.host,
      row.port,
      row.username,
      await decryptCredential(row.password),
      row.protocol,
      row.regionName || countryName(row.region),
      proxyNoteValue(row.note, "CITY"),
      visibleProxyNote(row.note),
      localTime(row.expiresAt),
    ].map(csv).join(","));
  }

  await audit({ id: user.id, role: user.role }, "proxy.export", "proxy", null, { count: rows.length }, request);
  return new Response(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="yehaoproxy-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
