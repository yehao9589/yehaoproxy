import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentCustomer } from "../../../lib/auth";
import { audit } from "../../../lib/audit";
import { getDb } from "../../../db";
import { inventory, orders, proxyAllocations, serviceRequests } from "../../../db/schema";

const DAY = 86400000;

export async function GET() {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const items = await getDb().select().from(serviceRequests)
    .where(eq(serviceRequests.customerId, user.id))
    .orderBy(desc(serviceRequests.createdAt)).limit(100);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const type = String(body?.type || "");
  const allocationId = String(body?.allocationId || "");
  if (!["renew", "replace"].includes(type) || !allocationId)
    return NextResponse.json({ error: "申请参数无效" }, { status: 400 });

  const db = getDb();
  const [owned] = await db.select({ allocation: proxyAllocations, order: orders })
    .from(proxyAllocations).innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .where(and(eq(proxyAllocations.id, allocationId), eq(orders.customerEmail, user.email), eq(proxyAllocations.status, "active"))).limit(1);
  if (!owned) return NextResponse.json({ error: "代理不存在或不可操作" }, { status: 404 });

  const [pending] = await db.select().from(serviceRequests)
    .where(and(eq(serviceRequests.allocationId, allocationId), eq(serviceRequests.type, type as "renew" | "replace"), eq(serviceRequests.status, "pending"))).limit(1);
  if (pending) return NextResponse.json({ error: "已有相同申请正在处理" }, { status: 409 });

  let durationDays: number | null = null;
  let amount: number | null = null;
  let reason: string | null = null;
  const now = new Date();

  if (type === "renew") {
    durationDays = Number(body.durationDays);
    if (![7, 30, 90].includes(durationDays))
      return NextResponse.json({ error: "续费时长无效" }, { status: 400 });
    const [stock] = await db.select({ salePrice: inventory.salePrice }).from(inventory)
      .where(and(eq(inventory.host, owned.allocation.host), eq(inventory.port, owned.allocation.port))).limit(1);
    const multiplier = durationDays === 7 ? .35 : durationDays === 30 ? 1 : 2.55;
    amount = Number(((stock?.salePrice || 0) * multiplier).toFixed(2));
  } else {
    const expiry = owned.allocation.expiresAt || owned.order.expiresAt;
    if (!expiry) return NextResponse.json({ error: "该代理缺少提取时间，无法申请更换，请联系管理员" }, { status: 409 });
    const extractedAt = new Date(expiry.getTime() - owned.order.durationDays * DAY);
    const eligibleUntil = new Date(extractedAt.getTime() + 3 * DAY);
    if (now > eligibleUntil)
      return NextResponse.json({ error: `该 IP 已超过提取后 3 天的更换期限（截止 ${eligibleUntil.toLocaleString("zh-CN", { hour12: false })}）` }, { status: 409 });
    reason = String(body.reason || "").trim().slice(0, 500);
    if (reason.length < 5) return NextResponse.json({ error: "请填写至少 5 个字的更换原因" }, { status: 400 });
  }

  const id = `SR-${crypto.randomUUID().slice(0, 10)}`;
  await db.insert(serviceRequests).values({ id, customerId: user.id, allocationId, type: type as "renew" | "replace", durationDays, reason, amount, status: "pending", createdAt: now, updatedAt: now });
  await audit({ id: user.id, role: user.role }, `service.${type}.create`, "service_request", id, { allocationId, durationDays, reason }, req);
  return NextResponse.json({ id, status: "pending", amount }, { status: 201 });
}
