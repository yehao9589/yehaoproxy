import {NextResponse} from "next/server";
import {and,asc,eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../../lib/auth";
import {getDb} from "../../../../../db";
import {ticketMessages,tickets} from "../../../../../db/schema";
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentCustomer();if(!u)return NextResponse.json({error:"请先登录"},{status:401});
 const{id}=await params,db=getDb(),[t]=await db.select().from(tickets).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id))).limit(1);
 if(!t)return NextResponse.json({error:"工单不存在"},{status:404});
 const messages=await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId,id),eq(ticketMessages.internal,false))).orderBy(asc(ticketMessages.createdAt));
 return NextResponse.json({ticket:t,messages});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentCustomer();if(!u)return NextResponse.json({error:"请先登录"},{status:401});
 const{id}=await params,body=String((await req.json().catch(()=>null))?.body||"").trim().slice(0,5000),db=getDb(),[t]=await db.select().from(tickets).where(and(eq(tickets.id,id),eq(tickets.customerId,u.id))).limit(1);
 if(!t||["closed","resolved"].includes(t.status))return NextResponse.json({error:"工单不可回复"},{status:409});
 if(body.length<2)return NextResponse.json({error:"回复内容为空"},{status:400});
 const now=new Date();await db.insert(ticketMessages).values({id:crypto.randomUUID(),ticketId:id,authorId:u.id,authorRole:"customer",body,internal:false,createdAt:now});await db.update(tickets).set({status:"waiting_staff",updatedAt:now}).where(eq(tickets.id,id));
 return NextResponse.json({ok:true});
}
