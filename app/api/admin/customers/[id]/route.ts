import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdminApi } from "../../../../../lib/admin-auth";
import { audit } from "../../../../../lib/audit";
import { getDb } from "../../../../../db";
import { auditLogs, customers, notifications, orders, proxyAllocations, tickets, wallets, walletTransactions } from "../../../../../db/schema";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const{id}=await params,db=getDb(),[customer]=await db.select().from(customers).where(eq(customers.id,id)).limit(1);
  if(!customer||customer.role!=="customer")return NextResponse.json({error:"客户不存在"},{status:404});
  const [wallet]=await db.select().from(wallets).where(eq(wallets.customerId,id)).limit(1);
  const orderRows=await db.select().from(orders).where(eq(orders.customerEmail,customer.email)).orderBy(desc(orders.createdAt));
  const assets=await db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,username:proxyAllocations.username,protocol:proxyAllocations.protocol,status:proxyAllocations.status,expiresAt:proxyAllocations.expiresAt,autoRenew:proxyAllocations.autoRenew,product:orders.product,region:orders.region}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(orders.customerEmail,customer.email)).orderBy(desc(proxyAllocations.expiresAt));
  const [transactions,ticketRows,logs,notificationRows]=await Promise.all([db.select().from(walletTransactions).where(eq(walletTransactions.customerId,id)).orderBy(desc(walletTransactions.createdAt)).limit(50),db.select().from(tickets).where(eq(tickets.customerId,id)).orderBy(desc(tickets.updatedAt)).limit(50),db.select().from(auditLogs).where(eq(auditLogs.actorId,id)).orderBy(desc(auditLogs.createdAt)).limit(50),db.select().from(notifications).where(eq(notifications.customerId,id)).orderBy(desc(notifications.createdAt)).limit(50)]);
  const paidStatuses=new Set(["paid","provisioning","active"]),totalSpent=orderRows.filter(x=>paidStatuses.has(x.status)).reduce((sum,x)=>sum+x.amount,0);
  const balance=wallet?.balance||0,creditLimit=wallet?.creditLimit||0,creditUsed=Math.max(0,-balance);return NextResponse.json({customer:{id:customer.id,email:customer.email,name:customer.name,status:customer.status,emailVerified:customer.emailVerified,createdAt:customer.createdAt},summary:{totalSpent:Number(totalSpent.toFixed(2)),orderCount:orderRows.length,activeAssets:assets.filter(x=>x.status==="active").length,totalAssets:assets.length,balance,frozen:wallet?.frozen||0,creditLimit,creditUsed,availableCredit:Math.max(0,creditLimit-creditUsed),openTickets:ticketRows.filter(x=>!["resolved","closed"].includes(x.status)).length},orders:orderRows,assets,transactions,tickets:ticketRows,logs,notifications:notificationRows});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){const admin=await requireAdminApi();if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});const{id}=await params,b=await req.json().catch(()=>null),[target]=await getDb().select().from(customers).where(eq(customers.id,id)).limit(1);if(!target)return NextResponse.json({error:"客户不存在"},{status:404});if(target.id===admin.id&&b.status==="suspended")return NextResponse.json({error:"不能停用当前管理员账号"},{status:409});const updates:{status?:"active"|"suspended";role?:"customer"|"admin"}={};if(["active","suspended"].includes(b.status))updates.status=b.status;if(["customer","admin"].includes(b.role))updates.role=b.role;if(!Object.keys(updates).length)return NextResponse.json({error:"没有可修改内容"},{status:400});await getDb().update(customers).set(updates).where(eq(customers.id,id));await audit({id:admin.id,role:admin.role},"customer.update","customer",id,updates,req);return NextResponse.json({ok:true})}
