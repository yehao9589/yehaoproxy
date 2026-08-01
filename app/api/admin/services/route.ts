import {NextResponse} from "next/server";
import {and,desc,eq,ne} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {customers,inventory,orders,proxyAllocations} from "../../../../db/schema";

export async function GET(){
 const admin=await requireAdminApi("orders");
 if(!admin)return NextResponse.json({error:"无服务管理权限"},{status:403});
 const db=getDb();
 const proxyRows=await db.select({id:proxyAllocations.id,orderId:orders.id,customerEmail:orders.customerEmail,customerId:customers.id,customerName:customers.name,product:orders.product,region:orders.region,host:proxyAllocations.host,port:proxyAllocations.port,protocol:proxyAllocations.protocol,expiresAt:proxyAllocations.expiresAt,autoRenew:proxyAllocations.autoRenew,status:proxyAllocations.status,country:inventory.country,city:inventory.city}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).leftJoin(customers,eq(customers.email,orders.customerEmail)).leftJoin(inventory,and(eq(inventory.reservedByOrderId,orders.id),eq(inventory.host,proxyAllocations.host),eq(inventory.port,proxyAllocations.port))).where(and(eq(proxyAllocations.status,"active"),ne(orders.status,"refunded"))).orderBy(desc(proxyAllocations.expiresAt));
 const nodeRows=await db.select({orderId:orders.id,customerEmail:orders.customerEmail,customerId:customers.id,customerName:customers.name,product:orders.product,region:orders.region,expiresAt:orders.expiresAt,autoRenew:orders.autoRenew,status:orders.status,adminNote:orders.adminNote}).from(orders).leftJoin(customers,eq(customers.email,orders.customerEmail)).where(eq(orders.status,"active")).orderBy(desc(orders.expiresAt));
 const proxies=proxyRows.map(row=>({kind:"proxy",...row,address:`${row.host}:${row.port}`}));
 const nodes=nodeRows.filter(row=>["computer-node","soft-router"].includes(row.product)&&!row.adminNote?.includes("[RENEWAL_OF]")).map(row=>({kind:"node",id:row.orderId,...row,address:null,protocol:null,country:null,city:null}));
 return NextResponse.json({items:[...proxies,...nodes],summary:{total:proxies.length+nodes.length,proxies:proxies.length,nodes:nodes.length,autoRenew:[...proxies,...nodes].filter(item=>item.autoRenew).length}});
}
