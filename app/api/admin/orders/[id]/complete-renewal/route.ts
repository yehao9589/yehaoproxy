import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import {
  customers,
  orders,
  proxyAllocations,
  wallets,
  walletTransactions,
} from "../../../../../../db/schema";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";

function noteValue(note: string | null, key: string) {
  return note?.match(new RegExp(`\\[${key}\\]([^\\n]*)`))?.[1]?.trim() ?? "";
}

function noteDate(note: string | null, key: string) {
  const value = noteValue(note, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi("orders");
  if (!admin) return NextResponse.json({ error: "无续费订单核验权限" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action === "reject" ? "reject" : body?.action === "approve" ? "approve" : "";
  if (!action) return NextResponse.json({ error: "请选择核验结果" }, { status: 400 });

  const { id } = await params;
  const db = getDb();
  const [renewal] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!renewal) return NextResponse.json({ error: "续费订单不存在" }, { status: 404 });

  const sourceId = noteValue(renewal.adminNote, "RENEWAL_OF");
  const allocationId = noteValue(renewal.adminNote, "RENEW_ALLOCATION");
  if (!sourceId) return NextResponse.json({ error: "该订单不是续费订单" }, { status: 409 });
  if (!['paid', 'provisioning'].includes(renewal.status)) {
    return NextResponse.json({ error: "该续费订单已经核验，不能重复处理" }, { status: 409 });
  }

  const [source] = await db.select().from(orders).where(and(eq(orders.id, sourceId), eq(orders.customerEmail, renewal.customerEmail))).limit(1);
  if (!source) return NextResponse.json({ error: "原服务订单不存在" }, { status: 409 });

  const now = new Date();
  if (action === "approve") {
    await db.update(orders).set({
      status: "active",
      updatedAt: now,
      adminNote: `${renewal.adminNote || ""}\n[RENEWAL_VERIFIED_AT]${now.toISOString()}`.trim(),
    }).where(eq(orders.id, id));
    await audit({ id: admin.id, role: admin.role }, "renewal.verify.approve", "order", id, { sourceOrderId: sourceId, allocationId: allocationId || null }, req);
    return NextResponse.json({ ok: true, action, expiresAt: source.expiresAt });
  }

  const previousSourceExpiry = noteDate(renewal.adminNote, "RENEW_PREVIOUS_SOURCE_EXPIRY");
  const previousAllocationExpiry = noteDate(renewal.adminNote, "RENEW_PREVIOUS_ALLOCATION_EXPIRY");
  await db.update(orders).set({ expiresAt: previousSourceExpiry, updatedAt: now }).where(eq(orders.id, sourceId));
  if (allocationId) {
    await db.update(proxyAllocations).set({ expiresAt: previousAllocationExpiry }).where(eq(proxyAllocations.id, allocationId));
  }

  const [customer] = await db.select().from(customers).where(eq(customers.email, renewal.customerEmail)).limit(1);
  if (!customer) return NextResponse.json({ error: "客户账户不存在，无法退款" }, { status: 409 });
  let [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, customer.id)).limit(1);
  if (!wallet) {
    await db.insert(wallets).values({ customerId: customer.id, balance: 0, frozen: 0, currency: renewal.currency, updatedAt: now });
    wallet = { customerId: customer.id, balance: 0, frozen: 0, creditLimit: 0, currency: renewal.currency, updatedAt: now };
  }
  const refund = Number(renewal.amount || 0);
  const balanceAfter = Number((wallet.balance + refund).toFixed(2));
  await db.update(wallets).set({ balance: balanceAfter, updatedAt: now }).where(eq(wallets.customerId, customer.id));
  await db.insert(walletTransactions).values({
    id: `WT-${crypto.randomUUID()}`,
    customerId: customer.id,
    type: "refund",
    amount: refund,
    balanceAfter,
    referenceType: "renewal_verification",
    referenceId: id,
    note: "续费核验不通过，款项已退回账户余额",
    operatorId: admin.id,
    createdAt: now,
  });
  await db.update(orders).set({
    status: "refunded",
    updatedAt: now,
    adminNote: `${renewal.adminNote || ""}\n[RENEWAL_REJECTED_AT]${now.toISOString()}`.trim(),
  }).where(eq(orders.id, id));
  await audit({ id: admin.id, role: admin.role }, "renewal.verify.reject", "order", id, { sourceOrderId: sourceId, allocationId: allocationId || null, refund, restoredExpiry: previousSourceExpiry }, req);
  return NextResponse.json({ ok: true, action, refund, expiresAt: previousSourceExpiry });
}
