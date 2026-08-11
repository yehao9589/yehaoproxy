import { env } from "cloudflare:workers";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { orders, productOffers, proxyAllocations, serviceRequests } from "../../../db/schema";
import { getCurrentCustomer } from "../../../lib/auth";
import { billingCycleFromNote } from "../../../lib/billing-period";

const durations = new Set([7, 30, 90]);

export async function POST(req: Request) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const product = String(body?.product || "");
  const region = String(body?.region || "").toUpperCase();
  const quantity = Number(body?.quantity);
  const durationDays = Number(body?.durationDays);
  if (
    !product ||
    !region ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 500 ||
    !durations.has(durationDays)
  ) return NextResponse.json({ error: "订单参数无效" }, { status: 400 });

  const db = getDb();
  const [offer] = await db
    .select()
    .from(productOffers)
    .where(and(
      eq(productOffers.product, product),
      eq(productOffers.region, region),
      eq(productOffers.enabled, true),
    ))
    .limit(1);
  if (!offer) return NextResponse.json({ error: "该商品地区暂未开放销售" }, { status: 404 });
  if (offer.billingCycle === "calendar-month" && durationDays === 7) return NextResponse.json({error: "自然月商品不支持 7 天周期"}, {status: 409});
  const unlimited = offer.saleStock < 0;
  const available = unlimited ? null : Math.max(0, offer.saleStock - offer.sold);
  if (!unlimited && available! < quantity) {
    return NextResponse.json({ error: "商城可售额度不足", available }, { status: 409 });
  }

  const unit = durationDays === 7 ? offer.price7 : durationDays === 90 ? offer.price90 : offer.price30;
  if (unit < 0) return NextResponse.json({error: `该商品暂不出售 ${durationDays} 天周期`}, {status: 409});
  const amount = Number((unit * quantity).toFixed(2));
  const now = Math.floor(Date.now() / 1000);
  const id = `YH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const d1 = (env as unknown as { DB: D1Database }).DB;
  const result = await d1.batch([
    d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'USD','pending',?,?,?)")
      .bind(id, user.email, product, region, quantity, durationDays, amount, `[BILLING_CYCLE]${offer.billingCycle}`, now, now),
    d1.prepare("UPDATE product_offers SET sold=sold+?,updated_at=? WHERE id=? AND enabled=1 AND (sale_stock<0 OR sale_stock-sold>=?)")
      .bind(quantity, now, offer.id, quantity),
  ]);
  if (!result[1].success || Number(result[1].meta?.changes) !== 1) {
    await d1.prepare("DELETE FROM orders WHERE id=?").bind(id).run();
    return NextResponse.json({ error: "商城可售额度刚刚发生变化，请重试" }, { status: 409 });
  }
  return NextResponse.json({
    id,
    status: "pending",
    amount,
    currency: "USD",
    entitlement: quantity,
    message: "付款后获得对应商品的服务额度",
  }, { status: 201 });
}

export async function GET() {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const db = getDb();
  const [rows, requestRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(serviceRequests).where(eq(serviceRequests.customerId, user.id)).orderBy(desc(serviceRequests.createdAt)).limit(200),
  ]);
  const resourceOrderIds=new Set<string>();
  for(const order of rows){
    const note=String(order.adminNote||"");
    resourceOrderIds.add(note.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1]?.trim()||order.id);
    const raw=note.match(/\[BUNDLE_ITEMS\]([^\n]+)/)?.[1];
    if(raw)try{for(const item of JSON.parse(decodeURIComponent(raw)))if(item?.id)resourceOrderIds.add(String(item.id))}catch{}
  }
  const allocationRows=resourceOrderIds.size?await db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,wifiName:proxyAllocations.wifiName,protocol:proxyAllocations.protocol,note:proxyAllocations.note,status:proxyAllocations.status}).from(proxyAllocations).where(inArray(proxyAllocations.orderId,[...resourceOrderIds])):[];
  const allocationsByOrder=new Map<string,typeof allocationRows>();
  for(const allocation of allocationRows){const list=allocationsByOrder.get(allocation.orderId)||[];list.push(allocation);allocationsByOrder.set(allocation.orderId,list)}
  const requestById = new Map(requestRows.map((request) => [request.id, request]));
  const serviceRequestForOrder = (order: typeof rows[number]) => {
    const note = String(order.adminNote || "");
    const explicitId = note.match(/\[FREE_REPLACEMENT_REQUEST\]([^\n]+)/)?.[1]?.trim();
    if (explicitId && requestById.has(explicitId)) return requestById.get(explicitId)!;
    const targetId = note.match(/\[(?:REPLACE_ALLOCATION|RESET_OF|TARGET_ORDER)\]([^\n]+)/)?.[1]?.trim();
    return requestRows.find((request) =>
      String(request.reason || "").includes(order.id) ||
      Boolean(targetId && request.allocationId === targetId),
    ) || null;
  };
  const serialize = ({ adminNote, ...order }: typeof rows[number]) => {
    const renewalOf=adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1]?.trim()||null;
    const bundleItems=(()=>{const raw=adminNote?.match(/\[BUNDLE_ITEMS\]([^\n]+)/)?.[1];if(!raw)return null;try{return JSON.parse(decodeURIComponent(raw))}catch{return null}})();
    const sourceIds=renewalOf?[renewalOf]:bundleItems?.length?bundleItems.map((item:{id:string})=>item.id):[order.id];
    const resources=sourceIds.flatMap((id:string)=>allocationsByOrder.get(id)||[]).map(resource=>({id:resource.id,orderId:resource.orderId,ip:`${resource.host}:${resource.port}`,wifiName:resource.wifiName||null,country:rows.find(item=>item.id===resource.orderId)?.region||order.region,city:resource.note?.match(/\[CITY\]([^\n]*)/)?.[1]?.trim()||null,protocol:resource.protocol,status:resource.status}));
    return {
      ...order,
      billingCycle: billingCycleFromNote(adminNote),
      amount: adminNote?.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)?.[1]
        ? Number(adminNote.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)![1])
        : order.amount,
      renewalOf,
      subscriptionUrl: order.product === "computer-node"
        ? adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1] || null
        : null,
      bundleItems,
      resources,
      serviceRequestStatus: serviceRequestForOrder({ ...order, adminNote })?.status || null,
    };
  };
  return NextResponse.json({
    // 订单页保留合并订单，只展示一笔账单。
    items: rows.filter(order=>!order.adminNote?.includes("[BUNDLE_PARENT]")).map(serialize),
    // 服务页使用实际权益明细，合并订单按地区拆分后显示可提取额度。
    entitlements: rows.filter(order=>!order.adminNote?.includes("[BUNDLE_ITEMS]")).map(serialize),
  });
}
