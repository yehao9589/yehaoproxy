import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import {
  couponRedemptions,
  coupons,
  orders,
  proxyAllocations,
  serviceRequests,
  wallets,
  walletTransactions,
} from "../../../../../db/schema";
import { audit } from "../../../../../lib/audit";
import { getCurrentCustomer } from "../../../../../lib/auth";
import {addBillingPeriod,billingCycleFromNote} from "../../../../../lib/billing-period";

const nodeProducts = new Set(["soft-router", "computer-node"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentCustomer();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const couponCode = String(body?.couponCode || "")
    .trim()
    .toUpperCase();
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.customerEmail, user.email)))
    .limit(1);

  if (!order) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "订单状态不能支付" }, { status: 409 });
  }

  let discount = 0;
  let coupon: null | typeof coupons.$inferSelect = null;
  if (couponCode) {
    [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, couponCode))
      .limit(1);
    const currentTime = new Date();
    if (
      !coupon ||
      !coupon.enabled ||
      (coupon.startsAt && coupon.startsAt > currentTime) ||
      (coupon.expiresAt && coupon.expiresAt < currentTime) ||
      (coupon.totalLimit !== null && coupon.usedCount >= coupon.totalLimit) ||
      order.amount < coupon.minAmount
    ) {
      return NextResponse.json({ error: "优惠码不可用" }, { status: 400 });
    }
    discount =
      coupon.type === "fixed"
        ? coupon.value
        : (order.amount * coupon.value) / 100;
    if (coupon.maxDiscount !== null) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
    discount = Math.min(order.amount, Number(discount.toFixed(2)));
  }

  const payable = Number((order.amount - discount).toFixed(2));
  let [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.customerId, user.id))
    .limit(1);
  if (!wallet) {
    await db.insert(wallets).values({
      customerId: user.id,
      balance: 0,
      frozen: 0,
      creditLimit: 0,
      currency: "USD",
      updatedAt: new Date(),
    });
    [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.customerId, user.id))
      .limit(1);
  }

  const availableCredit = Math.max(
    0,
    wallet.creditLimit - Math.max(0, -wallet.balance),
  );
  const spendingPower = Math.max(0, wallet.balance) + availableCredit;
  if (spendingPower < payable) {
    return NextResponse.json(
      {
        error: "余额和可用信用额不足",
        balance: wallet.balance,
        creditLimit: wallet.creditLimit,
        availableCredit,
        payable,
      },
      { status: 409 },
    );
  }

  const nextBalance = Number((wallet.balance - payable).toFixed(2));
  const now = new Date();
  const txId = `WT-${crypto.randomUUID()}`;
  const renewalSourceId = order.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1];
  const renewalAllocationId = order.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1];
  const replacementAllocationId = order.adminNote?.match(/\[REPLACE_ALLOCATION\]([^\n]+)/)?.[1];
  const oneTimeService = order.adminNote?.includes("[BILLING_MODE]one-time") || false;
  const targetOrderId = order.adminNote?.match(/\[TARGET_ORDER\]([^\n]+)/)?.[1];
  const customOneTime = order.adminNote?.includes("[PRODUCT_TYPE]one-time-service") || false;
  const bundleOrder = order.product === "cart-bundle" && order.adminNote?.includes("[BUNDLE_ITEMS]");
  const nextStatus = "provisioning";

  await db
    .update(wallets)
    .set({ balance: nextBalance, updatedAt: now })
    .where(eq(wallets.customerId, user.id));
  await db.insert(walletTransactions).values({
    id: txId,
    customerId: user.id,
    type: "purchase",
    amount: -payable,
    balanceAfter: nextBalance,
    referenceType: "order",
    referenceId: id,
    note: `订单 ${id}`,
    createdAt: now,
  });
  if (coupon) {
    await db.insert(couponRedemptions).values({
      id: crypto.randomUUID(),
      couponId: coupon.id,
      customerId: user.id,
      orderId: id,
      discount,
      createdAt: now,
    });
    await db
      .update(coupons)
      .set({ usedCount: coupon.usedCount + 1 })
      .where(eq(coupons.id, coupon.id));
  }
  await db
    .update(orders)
    .set({
      status: nextStatus,
      amount: payable,
      paymentReference: txId,
      updatedAt: now,
    })
    .where(eq(orders.id, id));
  if (bundleOrder) {
    const customerOrders = await db.select().from(orders).where(eq(orders.customerEmail, user.email));
    const children = customerOrders.filter(item => item.adminNote?.includes(`[BUNDLE_PARENT]${id}`));
    for (const child of children) {
      await db.update(orders).set({
        status: "provisioning",
        paymentMethod: order.paymentMethod,
        paymentReference: txId,
        updatedAt: now,
      }).where(eq(orders.id, child.id));
    }
  }
  if (order.product === "node-traffic-reset") {
    const sourceOrderId = order.adminNote?.match(/\[RESET_OF\]([^\n]+)/)?.[1] || "未知节点";
    const requestId = `AS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await db.insert(serviceRequests).values({
      id: requestId,
      customerId: user.id,
      allocationId: sourceOrderId,
      type: "reset_traffic",
      durationDays: null,
      reason: `已付款重置订单 ${id}`,
      amount: payable,
      status: "pending",
      adminNote: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (customOneTime && targetOrderId) {
    const requestId = `AS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await db.insert(serviceRequests).values({
      id: requestId,
      customerId: user.id,
      allocationId: targetOrderId,
      type: "custom",
      durationDays: null,
      reason: `${order.product}（已付款订单 ${id}）`,
      amount: payable,
      status: "pending",
      adminNote: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (renewalSourceId) {
    const [sourceOrder] = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.id, renewalSourceId),
        eq(orders.customerEmail, user.email),
      ))
      .limit(1);
    if (!sourceOrder) {
      return NextResponse.json({ error: "续费对应的原服务不存在" }, { status: 409 });
    }
    const base = sourceOrder.expiresAt && sourceOrder.expiresAt > now
      ? sourceOrder.expiresAt
      : now;
    const cycle=billingCycleFromNote(sourceOrder.adminNote||order.adminNote);
    const expiresAt = addBillingPeriod(base,order.durationDays,cycle);
    await db.update(orders).set({
      status: "active",
      expiresAt,
      updatedAt: now,
    }).where(eq(orders.id, sourceOrder.id));
    let previousAllocationExpiry="";
    if(renewalAllocationId){const[allocation]=await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,renewalAllocationId)).limit(1);previousAllocationExpiry=allocation?.expiresAt?.toISOString()||"";const allocationBase=allocation?.expiresAt&&allocation.expiresAt>now?allocation.expiresAt:now,allocationExpiry=addBillingPeriod(allocationBase,order.durationDays,cycle);await db.update(proxyAllocations).set({expiresAt:allocationExpiry}).where(eq(proxyAllocations.id,renewalAllocationId))}
    await db.update(orders).set({status:"provisioning",adminNote:`${order.adminNote||""}\n[RENEW_PREVIOUS_SOURCE_EXPIRY]${sourceOrder.expiresAt?.toISOString()||""}\n[RENEW_PREVIOUS_ALLOCATION_EXPIRY]${previousAllocationExpiry}\n[RENEW_APPLIED_AT]${now.toISOString()}`.trim(),updatedAt:now}).where(eq(orders.id,id));
  }
  if (replacementAllocationId) {
    const reason = order.adminNote?.match(/\[REPLACE_REASON\]([^\n]+)/)?.[1] || "客户付费申请更换 IP";
    const [allocation] = await db.select().from(proxyAllocations).where(eq(proxyAllocations.id, replacementAllocationId)).limit(1);
    if (!allocation || allocation.status !== "active") {
      return NextResponse.json({ error: "更换对应的代理资源不存在或已失效" }, { status: 409 });
    }
    await db.insert(serviceRequests).values({
      id: `SR-${crypto.randomUUID().slice(0, 10)}`,
      customerId: user.id,
      allocationId: replacementAllocationId,
      type: "replace",
      durationDays: null,
      reason: `${reason}（已付款订单 ${id}）`,
      amount: payable,
      status: "pending",
      adminNote: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await audit(
    { id: user.id, role: user.role },
    "order.wallet_credit_pay",
    "order",
    id,
    {
      payable,
      discount,
      balanceAfter: nextBalance,
      creditUsed: Math.max(0, -nextBalance),
      txId,
      status: nextStatus,
    },
    req,
  );

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    paid: payable,
    discount,
    balance: nextBalance,
    creditUsed: Math.max(0, -nextBalance),
    availableCredit: Math.max(
      0,
      wallet.creditLimit - Math.max(0, -nextBalance),
    ),
  });
}
