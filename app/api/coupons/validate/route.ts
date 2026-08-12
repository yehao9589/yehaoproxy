import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { coupons } from "../../../../db/schema";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: Request) {
  const rate = consumeRateLimit(`coupon-validate:${clientAddress(req)}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "验证过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase();
  const amount = Number(body?.amount);
  if (!code || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "优惠码参数无效" }, { status: 400 });
  const [coupon] = await getDb().select().from(coupons).where(eq(coupons.code, code)).limit(1);
  const now = new Date();
  if (!coupon || !coupon.enabled || (coupon.startsAt && coupon.startsAt > now) || (coupon.expiresAt && coupon.expiresAt < now) || (coupon.totalLimit !== null && coupon.usedCount >= coupon.totalLimit) || amount < coupon.minAmount) return NextResponse.json({ error: "优惠码不可用" }, { status: 404 });
  let discount = coupon.type === "fixed" ? coupon.value : amount * coupon.value / 100;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(amount, Number(discount.toFixed(2)));
  return NextResponse.json({ ok: true, code: coupon.code, discount, finalAmount: Number((amount - discount).toFixed(2)) });
}
