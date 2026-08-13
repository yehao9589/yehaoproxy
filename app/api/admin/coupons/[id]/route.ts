import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import { coupons } from "../../../../../db/schema";
import { requireAdminApi } from "../../../../../lib/admin-auth";
import { audit } from "../../../../../lib/audit";
import { normalizeCouponCode, validCouponCode } from "../../../../../lib/coupon-code";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi("coupons");
  if (!admin) return NextResponse.json({ error: "无优惠券管理权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const db = getDb();
  const [current] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "优惠券不存在" }, { status: 404 });
  const code = normalizeCouponCode(body?.code);
  const type = String(body?.type || "");
  const value = Number(body?.value);
  const minAmount = Number(body?.minAmount || 0);
  const maxDiscount = body?.maxDiscount === "" || body?.maxDiscount == null ? null : Number(body.maxDiscount);
  const totalLimit = body?.totalLimit === "" || body?.totalLimit == null ? null : Number(body.totalLimit);
  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
  const enabled = body?.enabled === true || body?.enabled === "true" || body?.enabled === "on";
  if (!validCouponCode(code)) return NextResponse.json({ error: "优惠码需为 3–30 位字母、数字、百分号、下划线或短横线" }, { status: 400 });
  if (!["fixed", "percent"].includes(type) || !Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "优惠类型或优惠值无效" }, { status: 400 });
  if (type === "percent" && value > 100) return NextResponse.json({ error: "百分比优惠不能超过 100%" }, { status: 400 });
  if (!Number.isFinite(minAmount) || minAmount < 0 || maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0) || totalLimit !== null && (!Number.isInteger(totalLimit) || totalLimit < 1)) return NextResponse.json({ error: "消费门槛、最大优惠或使用次数无效" }, { status: 400 });
  if (startsAt && expiresAt && expiresAt <= startsAt) return NextResponse.json({ error: "到期时间必须晚于开始时间" }, { status: 400 });
  const [duplicate] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
  if (duplicate && duplicate.id !== id) return NextResponse.json({ error: "优惠码已被使用" }, { status: 409 });
  await db.update(coupons).set({ code, type: type as "fixed" | "percent", value, minAmount, maxDiscount, totalLimit, startsAt, expiresAt, enabled }).where(eq(coupons.id, id));
  await audit({ id: admin.id, role: admin.role }, "coupon.update", "coupon", id, { code, type, value, enabled }, req);
  return NextResponse.json({ ok: true });
}
