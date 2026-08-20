import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import { couponRedemptions, coupons, orders, proxyAllocations, serviceRequests, wallets, walletTransactions } from "../../../../../db/schema";
import { audit } from "../../../../../lib/audit";
import { getCurrentCustomer } from "../../../../../lib/auth";
import { addBillingPeriod, billingCycleFromNote } from "../../../../../lib/billing-period";
import { withRequestLock } from "../../../../../lib/request-lock";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;

  return withRequestLock(`wallet:${user.id}`, async () => {
    const body = await req.json().catch(() => null);
    const couponCode = String(body?.couponCode || "").trim().toUpperCase();
    const db = getDb();
    const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.customerEmail, user.email))).limit(1);
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.status !== "pending") return NextResponse.json({ error: "当前订单状态不能支付" }, { status: 409 });

    let discount = 0;
    let coupon: null | typeof coupons.$inferSelect = null;
    if (couponCode) {
      [coupon] = await db.select().from(coupons).where(eq(coupons.code, couponCode)).limit(1);
      const currentTime = new Date();
      if (!coupon || !coupon.enabled || (coupon.startsAt && coupon.startsAt > currentTime) || (coupon.expiresAt && coupon.expiresAt < currentTime) || (coupon.totalLimit !== null && coupon.usedCount >= coupon.totalLimit) || order.amount < coupon.minAmount) {
        return NextResponse.json({ error: "优惠码不可用" }, { status: 400 });
      }
      discount = coupon.type === "fixed" ? coupon.value : (order.amount * coupon.value) / 100;
      if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
      discount = Math.min(order.amount, Number(discount.toFixed(2)));
    }

    const payable = Number((order.amount - discount).toFixed(2));
    let [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, user.id)).limit(1);
    if (!wallet) {
      await db.insert(wallets).values({ customerId: user.id, balance: 0, frozen: 0, creditLimit: 0, currency: "USD", updatedAt: new Date() });
      [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, user.id)).limit(1);
    }
    const availableCredit = Math.max(0, wallet.creditLimit - Math.max(0, -wallet.balance));
    const spendingPower = Math.max(0, wallet.balance) + availableCredit;
    if (spendingPower < payable) return NextResponse.json({ error: "余额和可用信用额度不足", balance: wallet.balance, creditLimit: wallet.creditLimit, availableCredit, payable }, { status: 409 });

    const now = new Date();
    const nextBalance = Number((wallet.balance - payable).toFixed(2));
    const txId = `WT-PAY-${id}`;
    const renewalSourceId = order.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1];
    const renewalAllocationId = order.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1];
    const replacementAllocationId = order.adminNote?.match(/\[REPLACE_ALLOCATION\]([^\n]+)/)?.[1];
    const targetOrderId = order.adminNote?.match(/\[TARGET_ORDER\]([^\n]+)/)?.[1];
    const customOneTime = order.adminNote?.includes("[PRODUCT_TYPE]one-time-service") || false;
    const bundleOrder = order.product === "cart-bundle" && order.adminNote?.includes("[BUNDLE_ITEMS]");

    const customerOrders = bundleOrder || targetOrderId
      ? await db.select().from(orders).where(eq(orders.customerEmail, user.email))
      : [];
    const bundleChildren = bundleOrder ? customerOrders.filter((item) => item.adminNote?.includes(`[BUNDLE_PARENT]${id}`)) : [];
    const targetOrder = targetOrderId ? customerOrders.find((item) => item.id === targetOrderId) : null;
    if (targetOrderId && (!targetOrder || targetOrder.status === "refunded")) return NextResponse.json({ error: "一次性服务对应的原服务不存在或已退款" }, { status: 409 });

    const [renewalSource] = renewalSourceId
      ? await db.select().from(orders).where(and(eq(orders.id, renewalSourceId), eq(orders.customerEmail, user.email))).limit(1)
      : [undefined];
    if (renewalSourceId && (!renewalSource || renewalSource.status === "refunded")) return NextResponse.json({ error: "续费对应的原服务不存在或已退款" }, { status: 409 });
    const [renewalAllocation] = renewalAllocationId
      ? await db.select().from(proxyAllocations).where(eq(proxyAllocations.id, renewalAllocationId)).limit(1)
      : [undefined];
    if (renewalAllocationId && !renewalAllocation) return NextResponse.json({ error: "续费对应的代理资源不存在" }, { status: 409 });
    const [replacementAllocation] = replacementAllocationId
      ? await db.select().from(proxyAllocations).where(eq(proxyAllocations.id, replacementAllocationId)).limit(1)
      : [undefined];
    if (replacementAllocationId && (!replacementAllocation || replacementAllocation.status !== "active")) return NextResponse.json({ error: "更换对应的代理资源不存在或已失效" }, { status: 409 });

    const walletUpdate = db.update(wallets).set({ balance: nextBalance, updatedAt: now }).where(and(eq(wallets.customerId, user.id), eq(wallets.balance, wallet.balance)));
    type BatchQuery = Parameters<typeof db.batch>[0][number];
    const writes: BatchQuery[] = [
      walletUpdate,
      db.insert(walletTransactions).values({ id: txId, customerId: user.id, type: "purchase", amount: -payable, balanceAfter: nextBalance, referenceType: "order", referenceId: id, note: `订单 ${id}`, createdAt: now }),
      db.update(orders).set({ status: "provisioning", amount: payable, paymentMethod: "balance", paymentReference: txId, updatedAt: now }).where(and(eq(orders.id, id), eq(orders.status, "pending"))),
    ];
    if (coupon) {
      writes.push(db.insert(couponRedemptions).values({ id: crypto.randomUUID(), couponId: coupon.id, customerId: user.id, orderId: id, discount, createdAt: now }));
      writes.push(db.update(coupons).set({ usedCount: coupon.usedCount + 1 }).where(and(eq(coupons.id, coupon.id), eq(coupons.usedCount, coupon.usedCount))));
    }
    for (const child of bundleChildren) {
      writes.push(db.update(orders).set({ status: "provisioning", paymentMethod: "balance", paymentReference: txId, updatedAt: now }).where(eq(orders.id, child.id)));
      const childSourceId=child.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1];
      const childAllocationId=child.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1];
      if(childSourceId){
        const source=customerOrders.find(item=>item.id===childSourceId);
        if(!source||source.status==="refunded")return NextResponse.json({error:`续费明细 ${child.id} 对应的原服务不存在或已退款`},{status:409});
        const cycle=billingCycleFromNote(source.adminNote||child.adminNote),base=source.expiresAt&&source.expiresAt>now?source.expiresAt:now,expiresAt=addBillingPeriod(base,child.durationDays,cycle);
        writes.push(db.update(orders).set({status:"active",expiresAt,updatedAt:now}).where(eq(orders.id,source.id)));
        let previousAllocationExpiry="";
        if(childAllocationId){const[allocation]=await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,childAllocationId)).limit(1);if(!allocation)return NextResponse.json({error:`续费明细 ${child.id} 对应的代理资源不存在`},{status:409});previousAllocationExpiry=allocation.expiresAt?.toISOString()||"";const allocationBase=allocation.expiresAt&&allocation.expiresAt>now?allocation.expiresAt:now;writes.push(db.update(proxyAllocations).set({expiresAt:addBillingPeriod(allocationBase,child.durationDays,cycle)}).where(eq(proxyAllocations.id,allocation.id)))}
        writes.push(db.update(orders).set({adminNote:`${child.adminNote||""}\n[RENEW_PREVIOUS_SOURCE_EXPIRY]${source.expiresAt?.toISOString()||""}\n[RENEW_PREVIOUS_ALLOCATION_EXPIRY]${previousAllocationExpiry}\n[RENEW_APPLIED_AT]${now.toISOString()}`.trim(),updatedAt:now}).where(eq(orders.id,child.id)));
      }
    }
    if (order.product === "node-traffic-reset") {
      const sourceOrderId = order.adminNote?.match(/\[RESET_OF\]([^\n]+)/)?.[1] || targetOrderId;
      if (!sourceOrderId) return NextResponse.json({ error: "流量重置未关联原服务" }, { status: 409 });
      writes.push(db.insert(serviceRequests).values({ id: `AS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, customerId: user.id, allocationId: sourceOrderId, type: "reset_traffic", durationDays: null, reason: `已付款重置订单 ${id}`, amount: payable, status: "pending", adminNote: null, createdAt: now, updatedAt: now }));
    }
    if (customOneTime && targetOrderId) {
      writes.push(db.insert(serviceRequests).values({ id: `AS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, customerId: user.id, allocationId: targetOrderId, type: "custom", durationDays: null, reason: `${order.product}（已付款订单 ${id}）`, amount: payable, status: "pending", adminNote: null, createdAt: now, updatedAt: now }));
    }
    if (renewalSource) {
      const base = renewalSource.expiresAt && renewalSource.expiresAt > now ? renewalSource.expiresAt : now;
      const cycle = billingCycleFromNote(renewalSource.adminNote || order.adminNote);
      const expiresAt = addBillingPeriod(base, order.durationDays, cycle);
      writes.push(db.update(orders).set({ status: "active", expiresAt, updatedAt: now }).where(eq(orders.id, renewalSource.id)));
      let previousAllocationExpiry = "";
      if (renewalAllocation) {
        previousAllocationExpiry = renewalAllocation.expiresAt?.toISOString() || "";
        const allocationBase = renewalAllocation.expiresAt && renewalAllocation.expiresAt > now ? renewalAllocation.expiresAt : now;
        writes.push(db.update(proxyAllocations).set({ expiresAt: addBillingPeriod(allocationBase, order.durationDays, cycle) }).where(eq(proxyAllocations.id, renewalAllocation.id)));
      }
      writes.push(db.update(orders).set({ status: "provisioning", adminNote: `${order.adminNote || ""}\n[RENEW_PREVIOUS_SOURCE_EXPIRY]${renewalSource.expiresAt?.toISOString() || ""}\n[RENEW_PREVIOUS_ALLOCATION_EXPIRY]${previousAllocationExpiry}\n[RENEW_APPLIED_AT]${now.toISOString()}`.trim(), updatedAt: now }).where(eq(orders.id, id)));
    }
    if (replacementAllocation) {
      const reason = order.adminNote?.match(/\[REPLACE_REASON\]([^\n]+)/)?.[1] || "客户付费申请更换 IP";
      writes.push(db.insert(serviceRequests).values({ id: `SR-${crypto.randomUUID().slice(0, 10)}`, customerId: user.id, allocationId: replacementAllocation.id, type: "replace", durationDays: null, reason: `${reason}（已付款订单 ${id}）`, amount: payable, status: "pending", adminNote: null, createdAt: now, updatedAt: now }));
    }

    await db.batch(writes as [BatchQuery, ...BatchQuery[]]);
    await audit({ id: user.id, role: user.role }, "order.wallet_credit_pay", "order", id, { payable, discount, balanceAfter: nextBalance, creditUsed: Math.max(0, -nextBalance), txId, status: "provisioning" }, req);
    return NextResponse.json({ ok: true, status: "provisioning", paid: payable, discount, balance: nextBalance, creditUsed: Math.max(0, -nextBalance), availableCredit: Math.max(0, wallet.creditLimit - Math.max(0, -nextBalance)) });
  });
}
