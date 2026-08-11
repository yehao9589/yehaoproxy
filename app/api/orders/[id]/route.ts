import {env} from "cloudflare:workers";
import {and,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {orders,productOffers} from "../../../../db/schema";
import {audit} from "../../../../lib/audit";
import {getCurrentCustomer} from "../../../../lib/auth";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentCustomer();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const body=await req.json().catch(()=>null);
  if(body?.action!=="cancel")return NextResponse.json({error:"订单操作无效"},{status:400});
  const{id}=await params,db=getDb();
  const[order]=await db.select().from(orders).where(and(eq(orders.id,id),eq(orders.customerEmail,user.email))).limit(1);
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  if(order.status!=="pending")return NextResponse.json({error:"只有待付款订单可以关闭"},{status:409});

  const all=await db.select().from(orders).where(eq(orders.customerEmail,user.email));
  const children=order.product==="cart-bundle"
    ?all.filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${id}`))
    :[];
  const stockItems=children.length?children:[order];
  const d1=(env as unknown as{DB:D1Database}).DB;
  const now=Math.floor(Date.now()/1000);
  const stockStatements=[];
  for(const item of stockItems){
    const[offer]=await db.select().from(productOffers).where(and(eq(productOffers.product,item.product),eq(productOffers.region,item.region))).limit(1);
    if(offer)stockStatements.push(d1.prepare("UPDATE product_offers SET sold=max(0,sold-?),updated_at=? WHERE id=?").bind(item.quantity,now,offer.id));
  }
  const result=await d1.batch([
    d1.prepare("UPDATE orders SET status='failed',updated_at=? WHERE id=? AND customer_email=? AND status='pending'").bind(now,id,user.email),
    ...children.map(item=>d1.prepare("UPDATE orders SET status='failed',updated_at=? WHERE id=? AND status='pending'").bind(now,item.id)),
    ...stockStatements,
  ]);
  if(!result[0]?.success||Number(result[0].meta?.changes)!==1)return NextResponse.json({error:"订单状态已变化，请刷新后重试"},{status:409});
  await audit({id:user.id,role:user.role},"order.customer_cancel","order",id,{bundleItems:children.length,restoredItems:stockItems.length},req);
  return NextResponse.json({ok:true,id,status:"failed",message:"订单已关闭，销售额度已返还"});
}
