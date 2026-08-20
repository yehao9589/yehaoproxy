import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { getCurrentCustomer } from "../../../lib/auth";
import { getDb } from "../../../db";
import { orders, productOffers, proxyAllocations, systemOptions } from "../../../db/schema";
import { decryptCredential } from "../../../lib/inventory-crypto";
import { billingCycleFromNote } from "../../../lib/billing-period";
import { proxyNoteValue, visibleProxyNote } from "../../../lib/proxy-note";

export async function GET(req: Request) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const reveal = new URL(req.url).searchParams.get("reveal") === "1";
  const db = getDb();
  const ownedQuery = db.select({
      allocation: proxyAllocations,
      product: orders.product,
      region: orders.region,
      countryName: productOffers.regionName,
      offerBillingCycle: productOffers.billingCycle,
      price7: productOffers.price7,
      price30: productOffers.price30,
      price90: productOffers.price90,
      durationDays: orders.durationDays,
      renewalAmount: orders.renewalAmount,
      adminNote: orders.adminNote,
    })
    .from(proxyAllocations)
    .innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .leftJoin(productOffers, and(eq(productOffers.product, orders.product), eq(productOffers.region, orders.region)))
    .where(and(eq(orders.customerEmail, user.email), eq(proxyAllocations.status, "active"), ne(orders.status, "refunded")))
    .orderBy(desc(orders.createdAt))
    .limit(1000);
  const [owned, archiveRows] = await Promise.all([
    ownedQuery,
    db.select().from(systemOptions).where(eq(systemOptions.key,"expiredServiceArchiveDays")).limit(1),
  ]);
  const [archiveOption] = archiveRows;
  const archiveDays = Number(archiveOption?.value || 30), archiveCutoff = Date.now() - archiveDays * 86400000;
  const items = (await Promise.all(owned.map(async row => {
    if(row.allocation.expiresAt&&row.allocation.expiresAt.getTime()<archiveCutoff)return null;
    const activatedMarker=proxyNoteValue(row.allocation.note,"ACTIVATED_AT");
    const extractedAt=activatedMarker?new Date(activatedMarker):null;
    const replaceEligibleUntil = extractedAt ? new Date(extractedAt.getTime() + 3 * 86400000) : null;
    const rawNote = row.allocation.note || "";
    const city = proxyNoteValue(rawNote,"CITY") || null;
    const note = visibleProxyNote(rawNote);
    const savedBillingCycle = row.adminNote?.match(/\[BILLING_CYCLE\]([^\n]+)/)?.[1]?.trim();
    const billingCycle = savedBillingCycle === "calendar-month" || savedBillingCycle === "fixed-days"
      ? billingCycleFromNote(row.adminNote)
      : row.offerBillingCycle || "fixed-days";
    const availableRenewalPeriods = billingCycle === "calendar-month"
      ? [30,60,90]
      : [row.price7 !== null && row.price7 >= 0 ? 7 : null,row.price30 !== null && row.price30 >= 0 ? 30 : null,row.price90 !== null && row.price90 >= 0 ? 90 : null].filter((value):value is number=>value!==null);
    return {
      ...row.allocation,
      note,
      password: reveal
        ? await decryptCredential(row.allocation.encryptedPassword)
        : row.allocation.encryptedPassword
          ? "••••••••"
          : null,
      encryptedPassword: undefined,
      product: row.product,
      region: row.region,
      countryName: row.countryName || row.region,
      city,
      durationDays: row.durationDays,
      renewalAmount: row.renewalAmount,
      price7: row.price7,
      price30: row.price30,
      price90: row.price90,
      // 服务单独设置优先；历史订单没有保存周期时才使用商品当前默认规则。
      billingCycle,
      availableRenewalPeriods,
      extractedAt,
      replaceEligibleUntil,
      replaceEligible: Boolean(replaceEligibleUntil && new Date() <= replaceEligibleUntil),
    };
  }))).filter(Boolean);
  return NextResponse.json({ items });
}
