import {and,eq,inArray} from "drizzle-orm";
import {getDb} from "../db";
import {orders,proxyAllocations,systemOptions} from "../db/schema";
import {renewalCutoffDays,serviceBeyondExpiry} from "./customer-service-expiry";
import {orderMarker} from "./order-resource-context";

export async function getRenewalCutoffDays() {
  const [option]=await getDb().select({value:systemOptions.value}).from(systemOptions)
    .where(eq(systemOptions.key,"expiredServiceArchiveDays")).limit(1);
  return renewalCutoffDays(option?.value);
}

/** Block new payment attempts on old unpaid renewal bills as well as new orders.
 * Do not run this on gateway callbacks: a payment already submitted must be reconciled.
 */
export async function renewalPaymentBlocked(order: {id:string;customerEmail:string;adminNote:string|null}, now=Date.now()) {
  const bundle=orderMarker(order.adminNote,"BUNDLE_RENEWAL")==="true";
  if(!bundle&&!orderMarker(order.adminNote,"RENEWAL_OF"))return false;
  const db=getDb();
  const owned=await db.select({id:orders.id,expiresAt:orders.expiresAt,adminNote:orders.adminNote})
    .from(orders).where(eq(orders.customerEmail,order.customerEmail));
  const ownedById=new Map(owned.map(item=>[item.id,item]));
  const lines=bundle?owned.filter(item=>orderMarker(item.adminNote,"BUNDLE_PARENT")===order.id):[order];
  const targets=lines.map(item=>({
    sourceId:orderMarker(item.adminNote,"RENEWAL_OF"),
    allocationId:orderMarker(item.adminNote,"RENEW_ALLOCATION"),
  })).filter(item=>item.sourceId&&ownedById.has(item.sourceId));
  if(!targets.length)return false;
  const ids=[...new Set(targets.map(item=>item.allocationId).filter(Boolean))];
  const allocations=new Map<string,{orderId:string;expiresAt:Date|null}>();
  for(let start=0;start<ids.length;start+=80){
    const rows=await db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,expiresAt:proxyAllocations.expiresAt})
      .from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id))
      .where(and(eq(orders.customerEmail,order.customerEmail),inArray(proxyAllocations.id,ids.slice(start,start+80))));
    for(const row of rows)allocations.set(row.id,row);
  }
  const cutoff=await getRenewalCutoffDays();
  return targets.some(({sourceId,allocationId})=>{
    const allocation=allocations.get(allocationId);
    const expiry=allocationId?(allocation?.orderId===sourceId?allocation.expiresAt:null):ownedById.get(sourceId)?.expiresAt;
    return serviceBeyondExpiry(expiry,cutoff,now);
  });
}
