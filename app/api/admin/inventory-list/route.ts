import {NextResponse} from "next/server";
import {and,eq,like,or,sql} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {inventory,orders} from "../../../../db/schema";

export async function GET(req:Request){
  if(!await requireAdminApi("inventory"))return NextResponse.json({error:"无库存管理权限"},{status:403});
  const url=new URL(req.url),status=url.searchParams.get("status"),product=url.searchParams.get("product"),search=url.searchParams.get("search");
  const page=Math.max(1,Number(url.searchParams.get("page")||1)),size=Math.min(500,Math.max(1,Number(url.searchParams.get("size")||20))),filters=[];
  if(status)filters.push(eq(inventory.status,status as "available"|"reserved"|"allocated"|"disabled"));
  if(product)filters.push(eq(inventory.product,product));
  if(search)filters.push(or(like(inventory.host,`%${search}%`),like(inventory.username,`%${search}%`)));
  const where=filters.length?and(...filters):undefined,db=getDb();
  const items=await db.select({
    id:inventory.id,product:inventory.product,country:inventory.country,city:inventory.city,
    host:inventory.host,port:inventory.port,username:inventory.username,protocol:inventory.protocol,
    cost:inventory.cost,salePrice:inventory.salePrice,status:inventory.status,
    reservedByOrderId:inventory.reservedByOrderId,customerEmail:orders.customerEmail,
    createdAt:inventory.createdAt
  }).from(inventory).leftJoin(orders,eq(inventory.reservedByOrderId,orders.id)).where(where).limit(size).offset((page-1)*size);
  const[count]=await db.select({value:sql<number>`count(*)`}).from(inventory).where(where);
  return NextResponse.json({items,page,size,total:Number(count.value)});
}
