import {NextResponse} from "next/server";
import {asc,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {audit} from "../../../../../lib/audit";
import {getDb} from "../../../../../db";
import {customers,orders,proxyAllocations,ticketMessages,tickets} from "../../../../../db/schema";
import {parseTicketServiceLink,stripTicketServiceLink} from "../../../../../lib/ticket-service-link";
const statuses=["open","waiting_customer","waiting_staff","resolved","closed"] as const;
const priorities=["low","normal","high","urgent"] as const;
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await requireAdminApi("tickets");if(!admin)return NextResponse.json({error:"无工单管理权限"},{status:403});
 const{id}=await params,db=getDb(),[ticket]=await db.select({id:tickets.id,customerId:tickets.customerId,customerEmail:customers.email,customerName:customers.name,subject:tickets.subject,category:tickets.category,priority:tickets.priority,status:tickets.status,assignedAdminId:tickets.assignedAdminId,createdAt:tickets.createdAt,updatedAt:tickets.updatedAt}).from(tickets).leftJoin(customers,eq(customers.id,tickets.customerId)).where(eq(tickets.id,id)).limit(1);
 if(!ticket)return NextResponse.json({error:"工单不存在"},{status:404});
 const messages=await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId,id)).orderBy(asc(ticketMessages.createdAt)),link=parseTicketServiceLink(messages[0]?.body||"");let relatedService=null;if(link?.kind==="proxy"){const[row]=await db.select({id:proxyAllocations.id,orderId:orders.id,product:orders.product,region:orders.region,status:proxyAllocations.status,expiresAt:proxyAllocations.expiresAt}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(proxyAllocations.id,link.id)).limit(1);relatedService=row?{kind:"proxy",...row}:null}else if(link?.kind==="node"){const[row]=await db.select().from(orders).where(eq(orders.id,link.id)).limit(1);relatedService=row?{kind:"node",id:row.id,orderId:row.id,product:row.product,region:row.region,status:row.status,expiresAt:row.expiresAt}:null}return NextResponse.json({ticket,messages:messages.map(message=>({...message,body:stripTicketServiceLink(message.body)})),relatedService});
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await requireAdminApi("tickets");if(!admin)return NextResponse.json({error:"无工单管理权限"},{status:403});
 const{id}=await params,b=await req.json().catch(()=>null),db=getDb(),[ticket]=await db.select().from(tickets).where(eq(tickets.id,id)).limit(1);
 if(!ticket)return NextResponse.json({error:"工单不存在"},{status:404});
 const patch:Record<string,unknown>={updatedAt:new Date()};
 if(b?.status!==undefined){const status=String(b.status);if(!statuses.includes(status as typeof statuses[number]))return NextResponse.json({error:"工单状态无效"},{status:400});patch.status=status}
 if(b?.priority!==undefined){const priority=String(b.priority);if(!priorities.includes(priority as typeof priorities[number]))return NextResponse.json({error:"优先级无效"},{status:400});patch.priority=priority}
 if(b?.assignedAdminId!==undefined)patch.assignedAdminId=String(b.assignedAdminId||"")||null;
 if(Object.keys(patch).length===1)return NextResponse.json({error:"没有需要更新的内容"},{status:400});
 await db.update(tickets).set(patch).where(eq(tickets.id,id));
 await audit({id:admin.id,role:admin.role},"ticket.update","ticket",id,{status:b?.status,priority:b?.priority,assignedAdminId:b?.assignedAdminId},req);
 return NextResponse.json({ok:true});
}
