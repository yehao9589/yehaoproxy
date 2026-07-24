import {NextResponse} from "next/server";
import {and, eq} from "drizzle-orm";
import {env} from "cloudflare:workers";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getDb} from "../../../../db";
import {productOffers} from "../../../../db/schema";

const DURATIONS = new Set([7, 30, 90]);
type InputItem = {product: string; region: string; durationDays: number; quantity: number};

export async function POST(req: Request) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({error: "请先登录"}, {status: 401});

  const body = await req.json().catch(() => null);
  const items: InputItem[] = Array.isArray(body?.items) ? body.items.map((raw: any) => ({
    product: String(raw?.product || ""),
    region: String(raw?.region || "").toUpperCase(),
    durationDays: Number(raw?.durationDays),
    quantity: Number(raw?.quantity),
  })) : [];

  if (!items.length || items.length > 30 || items.some(item =>
    !item.product || !item.region || !DURATIONS.has(item.durationDays) ||
    !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 500
  )) return NextResponse.json({error: "购物车参数无效"}, {status: 400});

  const db = getDb();
  const offerByKey = new Map<string, typeof productOffers.$inferSelect>();
  const requiredByKey = new Map<string, number>();
  for (const item of items) {
    const key = `${item.product}:${item.region}`;
    requiredByKey.set(key, (requiredByKey.get(key) || 0) + item.quantity);
    if (offerByKey.has(key)) continue;
    const [offer] = await db.select().from(productOffers).where(and(
      eq(productOffers.product, item.product),
      eq(productOffers.region, item.region),
      eq(productOffers.enabled, true),
    )).limit(1);
    if (!offer) return NextResponse.json({error: `${item.product} / ${item.region} 当前未开放销售`}, {status: 409});
    offerByKey.set(key, offer);
  }

  for (const [key, required] of requiredByKey) {
    const offer = offerByKey.get(key)!;
    const available = Math.max(0, offer.saleStock - offer.sold);
    if (available < required) {
      return NextResponse.json({error: `${offer.regionName} 可售额度不足`, available, required}, {status: 409});
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const d1 = (env as unknown as {DB: D1Database}).DB;
  const created = items.map(item => {
    const offer = offerByKey.get(`${item.product}:${item.region}`)!;
    const unit = item.durationDays === 7 ? offer.price7 : item.durationDays === 90 ? offer.price90 : offer.price30;
    return {...item, id: `YH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, amount: Number((unit * item.quantity).toFixed(2))};
  });

  const statements = [
    ...Array.from(requiredByKey.entries()).map(([key, required]) => {
      const offer = offerByKey.get(key)!;
      return d1.prepare("UPDATE product_offers SET sold=sold+?,updated_at=? WHERE id=? AND enabled=1 AND sale_stock-sold>=?")
        .bind(required, now, offer.id, required);
    }),
    ...created.map(item => d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'USD','pending',?,?)")
      .bind(item.id, user.email, item.product, item.region, item.quantity, item.durationDays, item.amount, now, now)),
  ];
  const results = await d1.batch(statements);
  const stockResults = results.slice(0, requiredByKey.size);
  if (stockResults.some(result => !result.success || Number(result.meta?.changes) !== 1)) {
    const stockEntries = Array.from(requiredByKey.entries());
    await d1.batch([
      ...created.map(item => d1.prepare("DELETE FROM orders WHERE id=?").bind(item.id)),
      ...stockEntries.flatMap(([key, required], index) => {
        if (!stockResults[index]?.success || Number(stockResults[index]?.meta?.changes) !== 1) return [];
        return [d1.prepare("UPDATE product_offers SET sold=max(0,sold-?),updated_at=? WHERE id=?").bind(required, now, offerByKey.get(key)!.id)];
      }),
    ]);
    return NextResponse.json({error: "商品可售额度刚刚发生变化，请重新结算"}, {status: 409});
  }

  return NextResponse.json({
    ok: true,
    orders: created.map(item => ({id: item.id, amount: item.amount})),
    total: Number(created.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
  }, {status: 201});
}
