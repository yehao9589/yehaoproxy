import {NextResponse} from "next/server";
import {and,asc,eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../../lib/auth";
import {getDb} from "../../../../../db";
import {orders,proxyAllocations,ticketMessages,tickets} from "../../../../../db/schema";
import {parseTicketServiceLink,stripTicketServiceLink} from "../../../../../lib/ticket-service-link";
import {audit} from "../../../../../lib/audit";
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentCustomer();if(!u)return NextResponse.json({error:"请先登录"},{status:401});
 const{id}=await params,db=getDb(),[t]=await db.select().from(tickets).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id))).limit(1);
 if(!t)return NextResponse.json({error:"工单不存在"},{status:404});
 const messages=await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId,id),eq(ticketMessages.internal,false))).orderBy(asc(ticketMessages.createdAt)),link=parseTicketServiceLink(messages[0]?.body||"");let relatedService=null;if(link?.kind==="proxy"){const[row]=await db.select({id:proxyAllocations.id,orderId:orders.id,product:orders.product,region:orders.region,status:proxyAllocations.status,expiresAt:proxyAllocations.expiresAt}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(and(eq(proxyAllocations.id,link.id),eq(orders.customerEmail,u.email))).limit(1);relatedService=row?{kind:"proxy",...row}:null}else if(link?.kind==="node"){const[row]=await db.select().from(orders).where(and(eq(orders.id,link.id),eq(orders.customerEmail,u.email))).limit(1);relatedService=row?{kind:"node",id:row.id,orderId:row.id,product:row.product,region:row.region,status:row.status,expiresAt:row.expiresAt}:null}return NextResponse.json({ticket:t,messages:messages.map(message=>({...message,body:stripTicketServiceLink(message.body)})),relatedService});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentCustomer();if(!u)return NextResponse.json({error:"请先登录"},{status:401});
 const{id}=await params,body=String((await req.json().catch(()=>null))?.body||"").trim().slice(0,5000),db=getDb(),[t]=await db.select().from(tickets).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id))).limit(1);
 if(!t||["closed","resolved"].includes(t.status))return NextResponse.json({error:"工单不可回复"},{status:409});
 if(body.length<2)return NextResponse.json({error:"回复内容为空"},{status:400});
 const now=new Date();await db.insert(ticketMessages).values({id:crypto.randomUUID(),ticketId:id,authorId:u.id,authorRole:"customer",body,internal:false,createdAt:now});await db.update(tickets).set({status:"waiting_staff",updatedAt:now}).where(eq(tickets.id,id));
 await audit({id:u.id,role:u.role},"ticket.customer_reply","ticket",id,{previousStatus:t.status,status:"waiting_staff"},req);
 return NextResponse.json({ok:true});
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentCustomer();if(!u)return NextResponse.json({error:"请先登录"},{status:401});
 const{id}=await params,body=await req.json().catch(()=>null),action=String(body?.action||""),db=getDb(),[t]=await db.select().from(tickets).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id))).limit(1);
 if(!t)return NextResponse.json({error:"工单不存在"},{status:404});
 if(action!=="close")return NextResponse.json({error:"不支持的工单操作"},{status:400});
 if(t.status==="closed")return NextResponse.json({ok:true,status:"closed"});
 if(t.status==="resolved")return NextResponse.json({error:"已解决的工单无需再次关闭"},{status:409});
 const now=new Date();
 await db.update(tickets).set({status:"closed",updatedAt:now}).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id)));
 await audit({id:u.id,role:u.role},"ticket.customer_close","ticket",id,{previousStatus:t.status},req);
 return NextResponse.json({ok:true,status:"closed"});
}
