import {eq,inArray} from "drizzle-orm";
import {getDb} from "../db";
import {orders,proxyAllocations,systemOptions} from "../db/schema";
import {resourcesForOrder,orderMarker} from "./order-resource-context";
import {visibleProxyNote} from "./proxy-note";

export async function customerLedgerServices(email:string,referenceIds:string[]){
 const db=getDb();
 const [owned,allocations]=referenceIds.length?await Promise.all([
  db.select({id:orders.id,product:orders.product,region:orders.region,quantity:orders.quantity,amount:orders.amount,currency:orders.currency,status:orders.status,paymentMethod:orders.paymentMethod,paymentReference:orders.paymentReference,createdAt:orders.createdAt,adminNote:orders.adminNote}).from(orders).where(eq(orders.customerEmail,email)),
  db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,wifiName:proxyAllocations.wifiName,note:proxyAllocations.note}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(orders.customerEmail,email)),
 ]):[[],[]];
 const ownedById=new Map(owned.map(order=>[order.id,order])),childrenById=new Map<string,typeof owned>();
 for(const item of owned){
   const parent=orderMarker(item.adminNote,"BUNDLE_PARENT");
   if(parent){
     const children=childrenById.get(parent)||[];
     children.push(item);
     childrenById.set(parent,children);
   }
 }
 const referenced=referenceIds.flatMap(id=>{const item=ownedById.get(id);return item?[item]:[];});
 const sourceIdFor=(item:typeof owned[number])=>orderMarker(item.adminNote,"RENEWAL_OF")||orderMarker(item.adminNote,"RESET_OF")||item.id;
 const isNode=(item:typeof owned[number])=>["computer-node","soft-router","node-traffic-reset"].includes(item.product);
 const noteKeys=[...new Set(referenced.flatMap(order=>(childrenById.get(order.id)||[order]).flatMap(item=>
   isNode(item)&&ownedById.has(sourceIdFor(item))?["node_customer_note:"+sourceIdFor(item)]:[])))];
 const notes=new Map<string,string>();
 for(let start=0;start<noteKeys.length;start+=80){
   const rows=await db.select({key:systemOptions.key,value:systemOptions.value}).from(systemOptions).where(inArray(systemOptions.key,noteKeys.slice(start,start+80)));
   for(const row of rows)notes.set(row.key,row.value);
 }
 const services=new Map(referenced.map(order=>{
  const children=childrenById.get(order.id)||[];
  const items=(children.length?children:[order]).filter(o=>o.product!=="wallet-topup").map(item=>{
   const sourceId=sourceIdFor(item),source=ownedById.get(sourceId);
   const resources=resourcesForOrder(item,owned,allocations).map(a=>({id:a.id,name:a.wifiName||"未设置",ip:a.host+":"+a.port,note:visibleProxyNote(a.note||"")}));
   if(source&&isNode(item))resources.push({id:sourceId,name:source.product==="soft-router"?"软路由中转":"电脑节点",ip:"",note:notes.get("node_customer_note:"+sourceId)||""});
   const saved=orderMarker(item.adminNote,"BUNDLE_ITEM_AMOUNT");
   return {orderId:item.id,product:item.product,amount:saved?Number(saved):item.amount,currency:item.currency,resources};
  });
  return [order.id,{bundled:children.length>0,items}];
 }));
 const orderMap=new Map(referenced.map(({id,product,region,quantity,amount,currency,status,paymentMethod,paymentReference,createdAt})=>[
  id,{id,product:product==="cart-bundle"?"合并订单":product,region,quantity,amount,currency,status,paymentMethod,paymentReference,createdAt},
 ]));
 return {services,orderMap};
}
