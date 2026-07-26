import { and, eq, inArray, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import { orders, productOffers, systemOptions } from "../../../../../db/schema";
import { audit } from "../../../../../lib/audit";
import { getCurrentCustomer } from "../../../../../lib/auth";

const nodeProducts = new Set(["soft-router", "computer-node"]);
const durations = new Set([7, 30, 90]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.customerEmail, user.email)))
    .limit(1);
  if (!order || !nodeProducts.has(order.product)) {
    return NextResponse.json({ error: "节点服务不存在" }, { status: 404 });
  }
  if (!["paid", "provisioning", "active"].includes(order.status)) {
    return NextResponse.json({ error: "当前服务状态不能进行此操作" }, { status: 409 });
  }

  if (action === "auto-renew") {
    const autoRenew = Boolean(body?.autoRenew);
    const durationDays = Number(body?.durationDays || order.durationDays);
    if (!durations.has(durationDays)) {
      return NextResponse.json({ error: "自动续费周期无效" }, { status: 400 });
    }
    await db
      .update(orders)
      .set({ autoRenew, durationDays, updatedAt: new Date() })
      .where(eq(orders.id, id));
    await audit(
      { id: user.id, role: user.role },
      "node.auto_renew.update",
      "order",
      id,
      { autoRenew, durationDays },
      req,
    );
    return NextResponse.json({ ok: true, autoRenew, durationDays });
  }

  if (action === "renew") {
    const durationDays = Number(body?.durationDays);
    if (!durations.has(durationDays)) {
      return NextResponse.json({ error: "续费周期无效" }, { status: 400 });
    }
    const [offer] = await db
      .select()
      .from(productOffers)
      .where(and(
        eq(productOffers.product, order.product),
        eq(productOffers.region, order.region),
        eq(productOffers.enabled, true),
      ))
      .limit(1);
    if (!offer) return NextResponse.json({ error: "该节点商品已经下架，无法在线续费" }, { status: 409 });
    const unit = durationDays === 7 ? offer.price7 : durationDays === 90 ? offer.price90 : offer.price30;
    if (unit < 0) return NextResponse.json({ error: `该服务暂不支持续费 ${durationDays} 天` }, { status: 409 });
    const amount = Number((unit * order.quantity).toFixed(2));
    const renewalId = `RN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    await db.insert(orders).values({
      id: renewalId,
      customerEmail: user.email,
      product: order.product,
      region: order.region,
      quantity: order.quantity,
      durationDays,
      amount,
      currency: order.currency,
      status: "pending",
      paymentMethod: "balance",
      renewalAmount: amount,
      autoRenew: false,
      adminNote: `[RENEWAL_OF]${order.id}`,
      createdAt: now,
      updatedAt: now,
    });
    await audit(
      { id: user.id, role: user.role },
      "node.renewal.create",
      "order",
      renewalId,
      { sourceOrderId: order.id, durationDays, amount },
      req,
    );
    return NextResponse.json({ ok: true, orderId: renewalId, amount });
  }

  if (action === "reset-traffic") {
    if (order.status !== "active") {
      return NextResponse.json({ error: "只有已开通的节点可以购买流量重置" }, { status: 409 });
    }
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(
        eq(orders.customerEmail, user.email),
        eq(orders.product, "node-traffic-reset"),
        like(orders.adminNote, `%[RESET_OF]${order.id}%`),
        inArray(orders.status, ["pending", "paid", "provisioning"]),
      ))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "该节点已有待付款或正在处理的流量重置订单", orderId: existing.id },
        { status: 409 },
      );
    }
    const [priceOption] = await db
      .select()
      .from(systemOptions)
      .where(eq(systemOptions.key, "nodeTrafficResetPrice"))
      .limit(1);
    const configuredPrice = Number(priceOption?.value ?? 5);
    const amount = Number.isFinite(configuredPrice) && configuredPrice > 0
      ? Number(configuredPrice.toFixed(2))
      : 5;
    const resetOrderId = `RS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    await db.insert(orders).values({
      id: resetOrderId,
      customerEmail: user.email,
      product: "node-traffic-reset",
      region: order.region,
      quantity: 1,
      durationDays: 0,
      amount,
      currency: order.currency,
      status: "pending",
      paymentMethod: "balance",
      renewalAmount: null,
      autoRenew: false,
      adminNote: `[RESET_OF]${order.id}`,
      createdAt: now,
      updatedAt: now,
    });
    await audit(
      { id: user.id, role: user.role },
      "node.traffic_reset.order_create",
      "order",
      resetOrderId,
      { sourceOrderId: order.id, product: order.product, amount },
      req,
    );
    return NextResponse.json({ ok: true, orderId: resetOrderId, amount });
  }

  return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
}
