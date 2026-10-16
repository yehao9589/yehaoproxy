import {unpaidCancellationStatements} from "./unpaid-cancellation-sql";
import {and,eq,lte,inArray,sql} from "drizzle-orm";
import {getDb,getRawDatabase} from "../db";
import {orders,paymentTransactions,paymentGateways,auditLogs,customers} from "../db/schema";
import {getUnpaidOrderPolicy} from "./unpaid-order-settings";
import {unpaidOrderExpired} from "./unpaid-order-policy";
import {orderMarker} from "./order-resource-context";
import {withRequestLock} from "./request-lock";
import {readAlipayConfig,closeUnpaidAlipayTrade} from "./alipay";
import {completeOnlinePayment} from "./online-payment";
import {systemAudit} from "./audit";
import {setSystemOption} from "./db-upsert";

export async function expireUnpaidOrders(){
 const policy=await getUnpaidOrderPolicy(),result={enabled:policy.enabled,hours:policy.hours,scanned:0,cancelled:0,paid:0,skipped:0,failed:0};if(!policy.enabled)return result;
 const started=Date.now(),db=getDb(),cutoff=new Date(Date.now()-policy.hours*3600000);
 const candidates=await db.select().from(orders).where(and(eq(orders.status,"pending"),lte(orders.createdAt,cutoff),sql`coalesce(${orders.adminNote},'') not like '%[BUNDLE_PARENT]%'`)).orderBy(orders.createdAt).limit(100);
 for(const candidate of candidates){if(Date.now()-started>20000)break;if(orderMarker(candidate.adminNote,"BUNDLE_PARENT"))continue;result.scanned++;
 try{
 const outcome=await withRequestLock(`order-mutation:${candidate.id}`,async()=>{
  const [order]=await db.select().from(orders).where(eq(orders.id,candidate.id)).limit(1);if(!order||!unpaidOrderExpired(order,policy))return {kind:"skipped" as const};
  const all=order.product==="cart-bundle"?await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail)):[];
  const children=all.filter(item=>orderMarker(item.adminNote,"BUNDLE_PARENT")===order.id);
  if(children.some(item=>item.status!=="pending"))return {kind:"skipped" as const};
  const payments=await db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId,order.id));
  if(payments.some(item=>["succeeded","refunded"].includes(item.status)))return {kind:"skipped" as const};
  for(const payment of payments){const [gateway]=await db.select().from(paymentGateways).where(eq(paymentGateways.id,payment.gatewayId)).limit(1);if(!gateway||gateway.type!=="alipay")throw Error("支付渠道暂不支持自动核对，保留待付款订单");const trade=await closeUnpaidAlipayTrade(await readAlipayConfig(gateway),order.id);if(!trade.closed)return {kind:"paid" as const,gatewayId:gateway.id,tradeNo:trade.tradeNo,amount:trade.amount};if(trade.notCreated&&Date.now()-payment.updatedAt.getTime()<30*60000)return {kind:"skipped" as const};}
  const [owner]=await db.select({id:customers.id}).from(customers).where(eq(customers.email,order.customerEmail)).limit(1);
  return withRequestLock(`wallet:${owner?.id||order.customerEmail}`,async()=>{
   const [latest]=await db.select().from(orders).where(eq(orders.id,order.id)).limit(1);
   if(latest?.status!=="pending")return {kind:"skipped" as const};
   if(children.length){const refreshed=await db.select({status:orders.status}).from(orders).where(inArray(orders.id,children.map(child=>child.id)));if(refreshed.some(child=>child.status!=="pending"))return {kind:"skipped" as const};}
   const now=new Date();
   // Return stock only for original purchases that actually reserved a sale quota.
   const [creation]=await db.select({id:auditLogs.id}).from(auditLogs).where(and(eq(auditLogs.resourceId,order.id),inArray(auditLogs.action,["order.create","order.batch_create"]))).limit(1);
   const stockItems=(children.length?children:[order]).filter(item=>!orderMarker(item.adminNote,"RENEWAL_OF")&&!orderMarker(item.adminNote,"BUNDLE_RENEWAL")&&(!!creation||!!orderMarker(item.adminNote,"STOCK_OFFER_ID")));
   const raw=getRawDatabase();
   const batch=unpaidCancellationStatements(order,children,stockItems,now,crypto.randomUUID()).map(item=>raw.prepare(item.sql).bind(...item.params));
   const writes=await raw.batch(batch);if(Number(writes[0].meta?.changes)!==1)return {kind:"skipped" as const};
   await systemAudit("order.auto_cancel","order",order.id,{hours:policy.hours,createdAt:order.createdAt.toISOString(),children:children.length,restoredItems:stockItems.length});return {kind:"cancelled" as const};
  });
 });
 if(outcome.kind==="paid"){await completeOnlinePayment({orderId:candidate.id,gatewayId:outcome.gatewayId,tradeNo:outcome.tradeNo,paidAmount:outcome.amount});result.paid++;}else result[outcome.kind]++;
 }catch(error){result.failed++;await systemAudit("order.auto_cancel.failed","order",candidate.id,{error:error instanceof Error?error.message:"自动取消失败"});}
 }
 await setSystemOption("unpaid_order_last_run",JSON.stringify({...result,ranAt:new Date().toISOString()}));return result;
}
