import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { coupons } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { audit } from "../../../../lib/audit";
import { normalizeCouponCode, validCouponCode } from "../../../../lib/coupon-code";

export async function GET() {
  if (!await requireAdminApi("coupons")) return NextResponse.json({ error: "无优惠券管理权限" }, { status: 403 });
  return NextResponse.json({ items: await getDb().select().from(coupons).orderBy(desc(coupons.createdAt)).limit(500) });
}

export async function POST(req: Request) {
  const admin = await requireAdminApi("coupons");
  if (!admin) return NextResponse.json({ error: "无优惠券管理权限" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const code = normalizeCouponCode(body?.code);
  const type = String(body?.type || "");
  const value = Number(body?.value);
  const minAmount = Number(body?.minAmount || 0);
  const maxDiscount = body?.maxDiscount === "" || body?.maxDiscount == null ? null : Number(body.maxDiscount);
  const totalLimit = body?.totalLimit === "" || body?.totalLimit == null ? null : Number(body.totalLimit);
  if (!validCouponCode(code)) return NextResponse.json({ error: "优惠码需为 3–30 位字母、数字、下划线或短横线" }, { status: 400 });
  if (!["fixed", "percent"].includes(type)) return NextResponse.json({ error: "请选择有效的优惠类型" }, { status: 400 });
  if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "优惠值必须大于 0" }, { status: 400 });
  if (type === "percent" && value > 100) return NextResponse.json({ error: "百分比优惠不能超过 100%" }, { status: 400 });
  if (!Number.isFinite(minAmount) || minAmount < 0) return NextResponse.json({ error: "最低消费不能小于 0" }, { status: 400 });
  if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return NextResponse.json({ error: "最大优惠必须大于 0，或留空表示不限" }, { status: 400 });
  if (totalLimit !== null && (!Number.isInteger(totalLimit) || totalLimit < 1)) return NextResponse.json({ error: "总使用次数必须是大于 0 的整数，或留空表示不限" }, { status: 400 });
  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
  if (startsAt && expiresAt && expiresAt <= startsAt) return NextResponse.json({ error: "到期时间必须晚于开始时间" }, { status: 400 });
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await getDb().insert(coupons).values({ id, code, type: type as "fixed" | "percent", value, minAmount, maxDiscount, totalLimit, usedCount: 0, enabled: true, startsAt, expiresAt, createdAt: now });
  } catch {
    return NextResponse.json({ error: "优惠码已存在，请更换一个优惠码" }, { status: 409 });
  }
  await audit({ id: admin.id, role: admin.role }, "coupon.create", "coupon", id, { code, type, value }, req);
  return NextResponse.json({ id, code }, { status: 201 });
}
