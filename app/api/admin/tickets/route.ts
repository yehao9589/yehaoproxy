import {NextResponse} from "next/server";
import {and,desc,eq,notInArray} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {customers,tickets} from "../../../../db/schema";
import {AFTER_SALES_TICKET_CATEGORIES} from "../../../../lib/ticket-categories";
export async function GET(req:Request){
 if(!await requireAdminApi("tickets"))return NextResponse.json({error:"无工单管理权限"},{status:403});
 const status=new URL(req.url).searchParams.get("status");
 const ticketOnly=notInArray(tickets.category,[...AFTER_SALES_TICKET_CATEGORIES]);
 const items=await getDb().select({id:tickets.id,customerId:tickets.customerId,customerEmail:customers.email,customerName:customers.name,subject:tickets.subject,category:tickets.category,priority:tickets.priority,status:tickets.status,assignedAdminId:tickets.assignedAdminId,createdAt:tickets.createdAt,updatedAt:tickets.updatedAt}).from(tickets).leftJoin(customers,eq(customers.id,tickets.customerId)).where(status?and(ticketOnly,eq(tickets.status,status as "open"|"waiting_customer"|"waiting_staff"|"resolved"|"closed")):ticketOnly).orderBy(desc(tickets.updatedAt)).limit(500);
 return NextResponse.json({items});
}
