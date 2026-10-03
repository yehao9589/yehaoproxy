import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {orders,proxyAllocations,systemOptions} from "../db/schema";
import {resourcesForOrder,orderMarker} from "./order-resource-context";
import {visibleProxyNote} from "./proxy-note";
export async function customerLedgerServices(email:string){
 const db=getDb();
 const [owned,allocations,options]=await Promise.all([
  db.select().from(orders).where(eq(orders.customerEmail,email)),
  db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,wifiName:proxyAllocations.wifiName,note:proxyAllocations.note}).from(proxyAllocations).innerJoin(orders,eq(orders.id,proxyAllocations.orderId)).where(eq(orders.customerEmail,email)),
  db.select().from(systemOptions),
 ]);
 const notes=new Map(options.map(o=>[o.key,o.value]));
 return new Map(owned.map(order=>{
  const children=owned.filter(o=>orderMarker(o.adminNote,"BUNDLE_PARENT")===order.id);
  const items=(children.length?children:[order]).filter(o=>o.product!=="wallet-topup").map(item=>{
   const sourceId=orderMarker(item.adminNote,"RENEWAL_OF")||orderMarker(item.adminNote,"RESET_OF")||item.id,source=owned.find(o=>o.id===sourceId);
   const resources=resourcesForOrder(item,owned,allocations).map(a=>({id:a.id,name:a.wifiName||"未设置",ip:a.host+":"+a.port,note:visibleProxyNote(a.note||"")}));
   if(source&&["computer-node","soft-router","node-traffic-reset"].includes(item.product))resources.push({id:sourceId,name:source.product==="soft-router"?"软路由中转":"电脑节点",ip:"",note:notes.get("node_customer_note:"+sourceId)||""});
   const saved=orderMarker(item.adminNote,"BUNDLE_ITEM_AMOUNT");
   return {orderId:item.id,product:item.product,amount:saved?Number(saved):item.amount,currency:item.currency,resources};
  });
  return [order.id,{bundled:children.length>0,items}];
 }));
}
