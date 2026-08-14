import {NextResponse} from "next/server";
import {and,desc,eq,ne} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {customers,orders,proxyAllocations} from "../../../../db/schema";
import {billingCycleFromNote} from "../../../../lib/billing-period";
import {databaseText} from "../../../../lib/database-text";

export async function GET(){
 const admin=await requireAdminApi("orders");
 if(!admin)return NextResponse.json({error:"无服务管理权限"},{status:403});
 const db=getDb();
 const proxyRows=await db.select({id:proxyAllocations.id,orderId:orders.id,customerEmail:orders.customerEmail,customerId:customers.id,customerName:customers.name,product:orders.product,region:orders.region,durationDays:orders.durationDays,createdAt:orders.createdAt,orderAdminNote:orders.adminNote,host:proxyAllocations.host,port:proxyAllocations.port,wifiName:proxyAllocations.wifiName,protocol:proxyAllocations.protocol,note:proxyAllocations.note,expiresAt:proxyAllocations.expiresAt,autoRenew:proxyAllocations.autoRenew,status:proxyAllocations.status}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).leftJoin(customers,eq(customers.email,orders.customerEmail)).where(and(eq(proxyAllocations.status,"active"),ne(orders.status,"refunded"))).orderBy(desc(orders.createdAt));
 const nodeRows=await db.select({orderId:orders.id,customerEmail:orders.customerEmail,customerId:customers.id,customerName:customers.name,product:orders.product,region:orders.region,durationDays:orders.durationDays,createdAt:orders.createdAt,expiresAt:orders.expiresAt,autoRenew:orders.autoRenew,status:orders.status,adminNote:orders.adminNote}).from(orders).leftJoin(customers,eq(customers.email,orders.customerEmail)).where(eq(orders.status,"active")).orderBy(desc(orders.createdAt));
 const proxies=proxyRows.map(row=>({kind:"proxy",...row,orderAdminNote:undefined,billingCycle:billingCycleFromNote(row.orderAdminNote),note:undefined,country:row.region,city:databaseText(row.note).match(/\[CITY\]([^\n]*)/)?.[1]||null,address:`${row.host}:${row.port}`}));
 const nodes=nodeRows.filter(row=>["computer-node","soft-router"].includes(row.product)&&!databaseText(row.adminNote).includes("[RENEWAL_OF]")).map(row=>({kind:"node",id:row.orderId,...row,billingCycle:billingCycleFromNote(row.adminNote),adminNote:undefined,address:null,protocol:null,country:null,city:null}));
 const items=[...proxies,...nodes].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
 return NextResponse.json({items,summary:{total:items.length,proxies:proxies.length,nodes:nodes.length,autoRenew:items.filter(item=>item.autoRenew).length}});
}
