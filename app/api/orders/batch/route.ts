import {NextResponse} from "next/server";
import {and, eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getDb,getRawDatabase} from "../../../../db";
import {currencies,productOffers} from "../../../../db/schema";
import {sendOrderCreatedEmails} from "../../../../lib/order-notifications";
import {notifyAdmins} from "../../../../lib/admin-event-notifications";
import {ensureProductOfferSchema} from "../../../../lib/product-offer-schema";

const DURATIONS = new Set([7, 30, 90, 180]);
type InputItem = {product: string; region: string; durationDays: number; quantity: number};

export async function POST(req: Request) {
  await ensureProductOfferSchema();
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
  const [activeCurrency] = await db.select({code:currencies.code}).from(currencies).where(eq(currencies.enabled,true)).limit(1);
  const currency = activeCurrency?.code || "USD";
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
    if (offer.billingCycle === "calendar-month" && item.durationDays === 7) return NextResponse.json({error: `${offer.regionName} 为自然月商品，不支持 7 天周期`}, {status: 409});
    if (offer.billingCycle !== "calendar-month" && item.durationDays === 180) return NextResponse.json({error: `${offer.regionName} 不是自然月商品，不能购买 6 个月周期`}, {status: 409});
    offerByKey.set(key, offer);
  }

  for (const [key, required] of requiredByKey) {
    const offer = offerByKey.get(key)!;
    const unlimited = offer.saleStock < 0;
    const available = unlimited ? null : Math.max(0, offer.saleStock - offer.sold);
    if (!unlimited && available! < required) {
      void notifyAdmins("admin_stock_low",{product:offer.product,region:offer.region,required,available:available||0},[{label:"商品",value:offer.product},{label:"地区",value:offer.regionName||offer.region},{label:"需要数量",value:String(required)},{label:"可用库存",value:String(available||0),accent:true}]).catch(()=>{});
      return NextResponse.json({error: `${offer.regionName} 可售额度不足`, available, required}, {status: 409});
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const d1 = getRawDatabase();
  const bundleId = `YH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const created = items.flatMap(item => {
    const offer = offerByKey.get(`${item.product}:${item.region}`)!;
    const unit = item.durationDays === 7 ? offer.price7 : item.durationDays === 90 ? offer.price90 : item.durationDays === 180 ? offer.price180 : offer.price30;
    return Array.from({length:item.quantity},()=>({...item,quantity:1,unit}));
  }).map((item,index)=>({...item,id:`${bundleId}-${String(index+1).padStart(2,"0")}`,amount:Number(item.unit.toFixed(2))}));
  const unavailable = created.find(item => item.amount < 0);
  if (unavailable) return NextResponse.json({error: `${unavailable.product} / ${unavailable.region} 暂不出售 ${unavailable.durationDays} 天周期`}, {status: 409});

  const total = Number(created.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const singleItem = created.length === 1 ? created[0] : null;
  const bundleItems = encodeURIComponent(JSON.stringify(created.map(({id, product, region, durationDays, quantity, amount}) => ({id, product, region, durationDays, billingCycle:offerByKey.get(`${product}:${region}`)!.billingCycle, quantity, amount}))));
  const statements = [
    ...Array.from(requiredByKey.entries()).map(([key, required]) => {
      const offer = offerByKey.get(key)!;
      return d1.prepare("UPDATE product_offers SET sold=sold+?,updated_at=? WHERE id=? AND enabled=1 AND (sale_stock<0 OR sale_stock-sold>=?)")
        .bind(required, now, offer.id, required);
    }),
    ...(singleItem
      ? [d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)")
          .bind(bundleId, user.email, singleItem.product, singleItem.region, 1, singleItem.durationDays, total, currency, `[BILLING_CYCLE]${offerByKey.get(`${singleItem.product}:${singleItem.region}`)!.billingCycle}`, now, now)]
      : [
          d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending',?,?,?)")
            .bind(bundleId, user.email, "cart-bundle", "MULTI", created.reduce((sum,item)=>sum+item.quantity,0), 0, total, currency, `[BUNDLE_ITEMS]${bundleItems}`, now, now),
          ...created.map(item => d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,'pending',?,?,?)")
            .bind(item.id, user.email, item.product, item.region, item.quantity, item.durationDays, currency, `[BUNDLE_PARENT]${bundleId}\n[BUNDLE_ITEM_AMOUNT]${item.amount}\n[BILLING_CYCLE]${offerByKey.get(`${item.product}:${item.region}`)!.billingCycle}`, now, now)),
        ]),
  ];
  const results = await d1.batch(statements);
  const stockResults = results.slice(0, requiredByKey.size);
  if (stockResults.some((result: {success?:boolean;meta?:{changes?:number}}) => !result.success || Number(result.meta?.changes) !== 1)) {
    const stockEntries = Array.from(requiredByKey.entries());
    await d1.batch([
      d1.prepare("DELETE FROM orders WHERE id=?").bind(bundleId),
      ...(!singleItem ? created.map(item => d1.prepare("DELETE FROM orders WHERE id=?").bind(item.id)) : []),
      ...stockEntries.flatMap(([key, required], index) => {
        if (!stockResults[index]?.success || Number(stockResults[index]?.meta?.changes) !== 1) return [];
        return [d1.prepare("UPDATE product_offers SET sold=max(0,sold-?),updated_at=? WHERE id=?").bind(required, now, offerByKey.get(key)!.id)];
      }),
    ]);
    return NextResponse.json({error: "商品可售额度刚刚发生变化，请重新结算"}, {status: 409});
  }

  void sendOrderCreatedEmails({id:bundleId,customerEmail:user.email,product:singleItem?.product||"cart-bundle",region:singleItem?.region||"MULTI",quantity:created.length,durationDays:singleItem?.durationDays||0,billingCycle:singleItem?offerByKey.get(`${singleItem.product}:${singleItem.region}`)?.billingCycle:undefined,amount:total,currency}).catch(()=>{});

  return NextResponse.json({
    ok: true,
    order: {id: bundleId, amount: total, currency, itemCount: created.length},
    orders: [{id: bundleId, amount: total, currency}],
    total,
  }, {status: 201});
}
