import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { orders } from "../../../../../../db/schema";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { customerWifiNameDuplicates, customerWifiNameSuggestion } from "../../../../../../lib/customer-wifi-name";
import { wifiNameDuplicateMessage } from "../../../../../../lib/wifi-name";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdminApi("orders")) return NextResponse.json({ error: "无订单管理权限" }, { status: 403 });
  const { id } = await params, db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  if (query.has("name")) {
    const name = query.get("name") || "";
    const duplicates = await customerWifiNameDuplicates(db, order.customerEmail, name, query.get("excludeAllocationId") || undefined);
    return NextResponse.json({ count: duplicates.length, duplicates: duplicates.slice(0, 3), warning: wifiNameDuplicateMessage(name, duplicates.length) }, {
      headers: { "cache-control": "no-store" },
    });
  }
  const region = (query.get("country") || order.region).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return NextResponse.json({ error: "国家代码无效" }, { status: 400 });
  return NextResponse.json(await customerWifiNameSuggestion(db, order.customerEmail, order.product, region), {
    headers: { "cache-control": "no-store" },
  });
}
