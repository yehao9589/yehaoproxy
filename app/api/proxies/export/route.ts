import { and, eq } from "drizzle-orm";
import { getCurrentCustomer } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { decryptCredential } from "../../../../lib/inventory-crypto";
import { getDb } from "../../../../db";
import { orders, proxyAllocations } from "../../../../db/schema";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

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
    })
    .from(proxyAllocations)
    .innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .where(and(eq(orders.customerEmail, user.email), eq(proxyAllocations.status, "active")));

  const lines = ["host,port,username,password,protocol,note,expires_at"];
  for (const row of rows) {
    lines.push([
      row.host,
      row.port,
      row.username,
      await decryptCredential(row.password),
      row.protocol,
      row.note,
      row.expiresAt?.toISOString(),
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
