import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { customers, serviceRequests } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";

export async function GET(req: Request) {
  if (!await requireAdminApi("requests")) return NextResponse.json({ error: "无售后申请管理权限" }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  const db = getDb();
  const [rows, customerRows] = await Promise.all([
    db.select().from(serviceRequests).where(status ? eq(serviceRequests.status, status as "pending" | "approved" | "completed" | "rejected" | "cancelled") : undefined).orderBy(desc(serviceRequests.createdAt)).limit(200),
    db.select({ id: customers.id, name: customers.name, email: customers.email }).from(customers).where(eq(customers.role, "customer")),
  ]);
  const customerMap = new Map(customerRows.map((customer) => [customer.id, customer]));
  const items = rows.map((item) => ({ ...item, customerName: customerMap.get(item.customerId)?.name || "未设置名称", customerEmail: customerMap.get(item.customerId)?.email || null }));
  return NextResponse.json({ items });
}
