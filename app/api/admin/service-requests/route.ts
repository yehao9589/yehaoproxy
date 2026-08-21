import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { customers, orders, proxyAllocations, serviceRequests } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { parseReplacementSnapshot, stripReplacementSnapshot } from "../../../../lib/replacement-snapshot";

export async function GET(req: Request) {
  if (!await requireAdminApi("requests")) return NextResponse.json({ error: "无售后申请管理权限" }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  const db = getDb();
  const [rows, customerRows, allocationRows, orderRows] = await Promise.all([
    db.select().from(serviceRequests).where(status ? eq(serviceRequests.status, status as "pending" | "approved" | "completed" | "rejected" | "cancelled") : undefined).orderBy(desc(serviceRequests.createdAt)).limit(200),
    db.select({ id: customers.id, name: customers.name, email: customers.email }).from(customers).where(eq(customers.role, "customer")),
    db.select().from(proxyAllocations),
    db.select({ id: orders.id, region: orders.region }).from(orders),
  ]);
  const customerMap = new Map(customerRows.map((customer) => [customer.id, customer]));
  const allocationMap = new Map(allocationRows.map((allocation) => [allocation.id, allocation]));
  const orderMap = new Map(orderRows.map((order) => [order.id, order]));
  const items = rows.map((item) => {
    const allocation = allocationMap.get(item.allocationId);
    const snapshot = parseReplacementSnapshot(item.reason) || (allocation ? {
      address: `${allocation.host}:${allocation.port}`,
      username: allocation.username || null,
      wifiName: allocation.wifiName || null,
      protocol: allocation.protocol || null,
      country: orderMap.get(allocation.orderId)?.region || null,
      city: allocation.note?.match(/\[CITY\]([^\n]*)/)?.[1]?.trim() || null,
    } : null);
    return { ...item, reason: stripReplacementSnapshot(item.reason), assetAddress: snapshot?.address || null, previousAsset: snapshot, customerName: customerMap.get(item.customerId)?.name || "未设置名称", customerEmail: customerMap.get(item.customerId)?.email || null };
  });
  return NextResponse.json({ items });
}
