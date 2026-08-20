import { NextResponse } from "next/server";
import { and, desc, eq, notInArray, or } from "drizzle-orm";
import { requireAdminApi } from "../../../../../lib/admin-auth";
import { audit } from "../../../../../lib/audit";
import { hashPassword } from "../../../../../lib/auth";
import { getDb } from "../../../../../db";
import { auditLogs, authSessions, customers, notifications, orders, proxyAllocations, tickets, wallets, walletTransactions } from "../../../../../db/schema";
import { AFTER_SALES_TICKET_CATEGORIES } from "../../../../../lib/ticket-categories";
import { auditActionName, auditDetailText, auditResourceName } from "../../../../../lib/audit-display";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi("customers"))return NextResponse.json({error:"无客户管理权限"},{status:403});
  const{id}=await params,db=getDb(),[customer]=await db.select().from(customers).where(eq(customers.id,id)).limit(1);
  if(!customer||customer.role!=="customer")return NextResponse.json({error:"客户不存在"},{status:404});
  const [wallet]=await db.select().from(wallets).where(eq(wallets.customerId,id)).limit(1);
  const orderRows=await db.select().from(orders).where(eq(orders.customerEmail,customer.email)).orderBy(desc(orders.createdAt));
  const assetRows=await db.select({id:proxyAllocations.id,orderId:proxyAllocations.orderId,host:proxyAllocations.host,port:proxyAllocations.port,username:proxyAllocations.username,protocol:proxyAllocations.protocol,note:proxyAllocations.note,status:proxyAllocations.status,expiresAt:proxyAllocations.expiresAt,autoRenew:proxyAllocations.autoRenew,product:orders.product,region:orders.region}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(orders.customerEmail,customer.email)).orderBy(desc(proxyAllocations.expiresAt));
  const proxyAssets=assetRows.map(row=>({...row,kind:"proxy" as const,note:undefined,country:row.region,city:row.note?.match(/\[CITY\]([^\n]*)/)?.[1]||null}));
  const serviceStatuses=new Set(["paid","provisioning","active"]);
  const nodeAssets=orderRows.filter(row=>["computer-node","soft-router"].includes(row.product)&&serviceStatuses.has(row.status)&&!row.adminNote?.includes("[RENEWAL_OF]")).map(row=>({
    id:`node:${row.id}`,kind:"node" as const,orderId:row.id,host:null,port:null,username:null,protocol:"订阅服务",status:row.status,expiresAt:row.expiresAt,autoRenew:row.autoRenew,product:row.product,region:row.region,country:row.region,city:null,
    subscriptionUrl:row.adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1]||null,
  }));
  const assets=[...proxyAssets,...nodeAssets].sort((a,b)=>(b.expiresAt?.getTime()||0)-(a.expiresAt?.getTime()||0));
  const [transactions,ticketRows,logs,notificationRows]=await Promise.all([db.select().from(walletTransactions).where(eq(walletTransactions.customerId,id)).orderBy(desc(walletTransactions.createdAt)).limit(50),db.select().from(tickets).where(and(eq(tickets.customerId,id),notInArray(tickets.category,[...AFTER_SALES_TICKET_CATEGORIES]))).orderBy(desc(tickets.updatedAt)).limit(50),db.select().from(auditLogs).where(or(eq(auditLogs.actorId,id),and(eq(auditLogs.resourceType,"customer"),eq(auditLogs.resourceId,id)))).orderBy(desc(auditLogs.createdAt)).limit(50),db.select().from(notifications).where(eq(notifications.customerId,id)).orderBy(desc(notifications.createdAt)).limit(50)]);
  const paidStatuses=new Set(["paid","provisioning","active"]),paidOrders=orderRows.filter(x=>paidStatuses.has(x.status)),refundedOrders=orderRows.filter(x=>x.status==="refunded"),totalSpent=paidOrders.reduce((sum,x)=>sum+x.amount,0),refundedAmount=refundedOrders.reduce((sum,x)=>sum+x.amount,0);
  const localizedLogs=logs.map(log=>({id:log.id,action:log.action,actionLabel:auditActionName(log.action),resourceType:log.resourceType,resourceLabel:auditResourceName(log.resourceType),resourceId:log.resourceId,detailLabel:auditDetailText(log.detail,log.resourceType),ipAddress:log.ipAddress,createdAt:log.createdAt}));
  const balance=wallet?.balance||0,creditLimit=wallet?.creditLimit||0,creditUsed=Math.max(0,-balance);return NextResponse.json({customer:{id:customer.id,email:customer.email,name:customer.name,status:customer.status,emailVerified:customer.emailVerified,createdAt:customer.createdAt},summary:{totalSpent:Number(totalSpent.toFixed(2)),refundedAmount:Number(refundedAmount.toFixed(2)),orderCount:orderRows.length,paidOrderCount:paidOrders.length,refundedOrderCount:refundedOrders.length,activeAssets:assets.filter(x=>x.status==="active").length,totalAssets:assets.length,balance,frozen:wallet?.frozen||0,creditLimit,creditUsed,availableCredit:Math.max(0,creditLimit-creditUsed),openTickets:ticketRows.filter(x=>!["resolved","closed"].includes(x.status)).length},orders:orderRows,assets,transactions,tickets:ticketRows,logs:localizedLogs,notifications:notificationRows});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await requireAdminApi("customers");
  if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});
  const{id}=await params,b=await req.json().catch(()=>null),db=getDb();
  const[target]=await db.select().from(customers).where(eq(customers.id,id)).limit(1);
  if(!target||target.role!=="customer")return NextResponse.json({error:"客户不存在"},{status:404});
  if(target.id===admin.id&&b.status==="suspended")return NextResponse.json({error:"不能停用当前管理员账号"},{status:409});
  const updates:{status?:"active"|"suspended";role?:"customer"|"admin";name?:string|null;email?:string;emailVerified?:boolean}={};
  if(["active","suspended"].includes(b.status))updates.status=b.status;
  if(["customer","admin"].includes(b.role))updates.role=b.role;
  if(b.name!==undefined)updates.name=String(b.name).trim().slice(0,80)||null;
  if(b.email!==undefined){
    const email=String(b.email).trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"邮箱格式不正确"},{status:400});
    const[duplicate]=await db.select({id:customers.id}).from(customers).where(eq(customers.email,email)).limit(1);
    if(duplicate&&duplicate.id!==id)return NextResponse.json({error:"该邮箱已被其他客户使用"},{status:409});
    updates.email=email;
  }
  if(b.emailVerified!==undefined)updates.emailVerified=b.emailVerified===true||b.emailVerified==="true";
  const password=b.password===undefined?"":String(b.password);
  if(password&&(password.length<8||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)))return NextResponse.json({error:"新密码需为 8–128 位，并同时包含字母和数字"},{status:400});
  if(!Object.keys(updates).length&&!password)return NextResponse.json({error:"没有可修改内容"},{status:400});
  if(updates.email&&updates.email!==target.email)await db.update(orders).set({customerEmail:updates.email}).where(eq(orders.customerEmail,target.email));
  if(Object.keys(updates).length)await db.update(customers).set(updates).where(eq(customers.id,id));
  if(password){
    await db.update(customers).set({passwordHash:await hashPassword(password)}).where(eq(customers.id,id));
    await db.delete(authSessions).where(eq(authSessions.customerId,id));
  }
  await audit({id:admin.id,role:admin.role},password?"customer.password.update":"customer.update","customer",id,password?{sessionsRevoked:true}:updates,req);
  return NextResponse.json({ok:true,email:updates.email});
}
