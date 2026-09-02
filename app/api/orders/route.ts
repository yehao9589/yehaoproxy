import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, getRawDatabase } from "../../../db";
import { couponRedemptions, coupons, currencies, orders, productOffers, proxyAllocations, serviceRequests } from "../../../db/schema";
import { getCurrentCustomer } from "../../../lib/auth";
import { billingCycleFromNote } from "../../../lib/billing-period";
import {sendOrderCreatedEmails} from "../../../lib/order-notifications";
import {notifyAdmins} from "../../../lib/admin-event-notifications";
import {ensureProductOfferSchema} from "../../../lib/product-offer-schema";
import {nextBusinessId} from "../../../lib/business-id";
import {audit} from "../../../lib/audit";

const durations = new Set([7, 30, 90, 180]);

export async function POST(req: Request) {
  await ensureProductOfferSchema();
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
  const [activeCurrency] = await db.select({code:currencies.code}).from(currencies).where(eq(currencies.enabled,true)).limit(1);
  const currency = activeCurrency?.code || "USD";
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
  if (offer.billingCycle !== "calendar-month" && durationDays === 180) return NextResponse.json({error: "6 个月周期仅适用于自然月商品"}, {status: 409});
  const unlimited = offer.saleStock < 0;
  const available = unlimited ? null : Math.max(0, offer.saleStock - offer.sold);
  if (!unlimited && available! < quantity) {
    void notifyAdmins("admin_stock_low",{product,region,required:quantity,available:available||0},[{label:"商品",value:product},{label:"地区",value:region},{label:"需要数量",value:String(quantity)},{label:"可用库存",value:String(available||0),accent:true}]).catch(()=>{});
    return NextResponse.json({ error: "商城可售额度不足", available }, { status: 409 });
  }

  const unit = durationDays === 7 ? offer.price7 : durationDays === 90 ? offer.price90 : durationDays === 180 ? offer.price180 : offer.price30;
  if (unit < 0) return NextResponse.json({error: `该商品暂不出售 ${durationDays} 天周期`}, {status: 409});
  const amount = Number((unit * quantity).toFixed(2));
  const now = Math.floor(Date.now() / 1000);
  const id = await nextBusinessId("YH", new Date(now * 1000));
  const d1 = getRawDatabase();
  const result = await d1.batch([
    d1.prepare("INSERT INTO orders (id,customer_email,product,region,quantity,duration_days,amount,currency,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)")
      .bind(id, user.email, product, region, quantity, durationDays, amount, currency, `[BILLING_CYCLE]${offer.billingCycle}`, now, now),
    d1.prepare("UPDATE product_offers SET sold=sold+?,updated_at=? WHERE id=? AND enabled=1 AND (sale_stock<0 OR sale_stock-sold>=?)")
      .bind(quantity, now, offer.id, quantity),
  ]);
  if (!result[1].success || Number(result[1].meta?.changes) !== 1) {
    await d1.prepare("DELETE FROM orders WHERE id=?").bind(id).run();
    return NextResponse.json({ error: "商城可售额度刚刚发生变化，请重试" }, { status: 409 });
  }
  void sendOrderCreatedEmails({id,customerEmail:user.email,product,region,quantity,durationDays,billingCycle:offer.billingCycle,amount,currency}).catch(()=>{});
  await audit({id:user.id,role:user.role},"order.create","order",id,{product,region,quantity,durationDays,billingMode:offer.billingCycle,amount,currency},req);
  return NextResponse.json({
    id,
    status: "pending",
    amount,
    currency,
    entitlement: quantity,
    message: "付款后获得对应商品的服务额度",
  }, { status: 201 });
}

export async function GET() {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const db = getDb();
  const [rows, requestRows, redemptionRows, couponRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(serviceRequests).where(eq(serviceRequests.customerId, user.id)).orderBy(desc(serviceRequests.createdAt)).limit(200),
    db.select().from(couponRedemptions).where(eq(couponRedemptions.customerId,user.id)),
    db.select().from(coupons),
  ]);
  const redemptionByOrder=new Map(redemptionRows.map(row=>[row.orderId,row]));
  const couponById=new Map(couponRows.map(row=>[row.id,row]));
  const allocationRows=await db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,wifiName:proxyAllocations.wifiName,protocol:proxyAllocations.protocol,note:proxyAllocations.note,status:proxyAllocations.status,orderRegion:orders.region}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(orders.customerEmail,user.email));
  const allocationsByOrder=new Map<string,typeof allocationRows>();
  for(const allocation of allocationRows){const list=allocationsByOrder.get(allocation.orderId)||[];list.push(allocation);allocationsByOrder.set(allocation.orderId,list)}
  const allocationById=new Map(allocationRows.map(allocation=>[allocation.id,allocation]));
  const orderById=new Map(rows.map(order=>[order.id,order]));
  const requestById = new Map(requestRows.map((request) => [request.id, request]));
  const orderRegionById = new Map(rows.map((order) => [order.id, order.region]));
  const renewalChildrenByParent = new Map<string, typeof rows>();
  for (const row of rows) {
    const parentId = row.adminNote?.match(/\[BUNDLE_PARENT\]([^\n]+)/)?.[1]?.trim();
    if (!parentId) continue;
    const children = renewalChildrenByParent.get(parentId) || [];
    children.push(row);
    renewalChildrenByParent.set(parentId, children);
  }
  const requestByOrderId = new Map<string, typeof requestRows[number]>();
  const requestByAllocationId = new Map<string, typeof requestRows[number]>();
  for (const request of requestRows) {
    const relatedOrderId = String(request.reason || "").match(/YH-[A-Z0-9-]+/)?.[0];
    if (relatedOrderId && !requestByOrderId.has(relatedOrderId)) requestByOrderId.set(relatedOrderId, request);
    if (request.allocationId && !requestByAllocationId.has(request.allocationId)) requestByAllocationId.set(request.allocationId, request);
  }
  const serviceRequestForOrder = (order: typeof rows[number]) => {
    const note = String(order.adminNote || "");
    const explicitId = note.match(/\[FREE_REPLACEMENT_REQUEST\]([^\n]+)/)?.[1]?.trim();
    if (explicitId && requestById.has(explicitId)) return requestById.get(explicitId)!;
    const targetId = note.match(/\[(?:REPLACE_ALLOCATION|RESET_OF|TARGET_ORDER)\]([^\n]+)/)?.[1]?.trim();
    return requestByOrderId.get(order.id) || (targetId ? requestByAllocationId.get(targetId) : null) || null;
  };
  const serialize = ({ adminNote, ...order }: typeof rows[number]) => {
    const redemption=redemptionByOrder.get(order.id),coupon=redemption?couponById.get(redemption.couponId):null,discountAmount=Number(redemption?.discount||0);
    const renewalOf=adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1]?.trim()||null;
    const bundleRenewal=Boolean(adminNote?.includes("[BUNDLE_RENEWAL]true"));
    const renewalApplied=Boolean(adminNote?.includes("[RENEW_APPLIED_AT]"));
    const bundleChildren=renewalChildrenByParent.get(order.id)||[];
    const bundleRenewalApplied=bundleRenewal&&bundleChildren.length>0&&bundleChildren.every(child=>child.adminNote?.includes("[RENEW_APPLIED_AT]"));
    const bundleItems=(()=>{const raw=adminNote?.match(/\[BUNDLE_ITEMS\]([^\n]+)/)?.[1];if(!raw)return null;try{return JSON.parse(decodeURIComponent(raw))}catch{return null}})();
    const sourceIds=renewalOf?[renewalOf]:bundleItems?.length?bundleItems.map((item:{id:string})=>item.id):[order.id];
    const replacementAllocationId=adminNote?.match(/\[REPLACE_ALLOCATION\]([^\n]+)/)?.[1]?.trim()||null;
    const resourceRows=replacementAllocationId?[allocationById.get(replacementAllocationId)].filter((item):item is typeof allocationRows[number]=>Boolean(item)):sourceIds.flatMap((id:string)=>allocationsByOrder.get(id)||[]);
    const resources=resourceRows.map((resource:typeof allocationRows[number])=>({id:resource.id,orderId:resource.orderId,ip:`${resource.host}:${resource.port}`,wifiName:resource.wifiName||null,country:resource.orderRegion||orderRegionById.get(resource.orderId)||order.region,city:resource.note?.match(/\[CITY\]([^\n]*)/)?.[1]?.trim()||null,protocol:resource.protocol,status:resource.status}));
    const nodeSource=renewalOf?orderById.get(renewalOf):order,nodeSubscriptionUrl=nodeSource?.adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1]||null;
    return {
      ...order,
      couponCode:coupon?.code||null,
      discountAmount,
      originalAmount:Number((order.amount+discountAmount).toFixed(2)),
      paidAmount:order.amount,
      status: renewalApplied||bundleRenewalApplied ? "active" : order.status,
      billingCycle: billingCycleFromNote(adminNote),
      amount: adminNote?.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)?.[1]
        ? Number(adminNote.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)![1])
        : order.amount,
      renewalOf,
      bundleRenewal,
      subscriptionUrl: order.product === "computer-node"
        ? adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1] || null
        : null,
      nodeService: ["computer-node","soft-router"].includes(order.product)?{product:order.product,subscriptionUrl:nodeSubscriptionUrl,region:nodeSource?.region||order.region}:null,
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
