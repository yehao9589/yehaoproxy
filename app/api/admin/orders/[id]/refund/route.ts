import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";
import { getDb } from "../../../../../../db";
import {
  customers,
  orders,
  proxyAllocations,
  wallets,
  walletTransactions,
} from "../../../../../../db/schema";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApi("orders");
  if (!admin) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || "").trim();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);

  if (!order || !["paid", "provisioning", "active"].includes(order.status)) {
    return NextResponse.json({ error: "订单不可退款" }, { status: 409 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "请填写退款原因" }, { status: 400 });
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, order.customerEmail))
    .limit(1);
  if (!customer) return NextResponse.json({ error: "客户不存在" }, { status: 404 });

  let [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, customer.id)).limit(1);
  const now = new Date();
  if (!wallet) {
    await db.insert(wallets).values({
      customerId: customer.id,
      balance: 0,
      frozen: 0,
      currency: "USD",
      updatedAt: now,
    });
    wallet = { customerId: customer.id, balance: 0, frozen: 0, creditLimit: 0, currency: "USD", updatedAt: now };
  }

  const next = Number((wallet.balance + order.amount).toFixed(2));
  const txId = `WT-${crypto.randomUUID()}`;
  const allocations = await db
    .select({ id: proxyAllocations.id })
    .from(proxyAllocations)
    .where(eq(proxyAllocations.orderId, id));
  const allOrders = await db.select().from(orders).where(eq(orders.customerEmail, order.customerEmail));
  const children = order.product === "cart-bundle"
    ? allOrders.filter(item => item.adminNote?.includes(`[BUNDLE_PARENT]${id}`))
    : [];

  await db.update(wallets).set({ balance: next, updatedAt: now }).where(eq(wallets.customerId, customer.id));
  await db.insert(walletTransactions).values({
    id: txId,
    customerId: customer.id,
    type: "refund",
    amount: order.amount,
    balanceAfter: next,
    referenceType: "order",
    referenceId: id,
    note: reason,
    operatorId: admin.id,
    createdAt: now,
  });
  await db.update(proxyAllocations).set({ status: "revoked", autoRenew: false }).where(eq(proxyAllocations.orderId, id));
  await db.update(orders).set({ status: "refunded", autoRenew: false, updatedAt: now }).where(eq(orders.id, id));
  for (const child of children) {
    await db.update(proxyAllocations).set({ status: "revoked", autoRenew: false }).where(eq(proxyAllocations.orderId, child.id));
    await db.update(orders).set({ status: "refunded", autoRenew: false, updatedAt: now }).where(eq(orders.id, child.id));
  }

  await audit(
    { id: admin.id, role: admin.role },
    "order.refund",
    "order",
    id,
    { amount: order.amount, reason, txId, revokedAllocations: allocations.length, bundleItems: children.length },
    req,
  );
  return NextResponse.json({
    ok: true,
    status: "refunded",
    amount: order.amount,
    balance: next,
    revokedAllocations: allocations.length,
  });
}
