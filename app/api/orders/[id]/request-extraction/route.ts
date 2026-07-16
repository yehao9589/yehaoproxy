import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../../lib/auth";
import {getDb} from "../../../../../db";
import {inventory,notifications,orders,proxyAllocations} from "../../../../../db/schema";
import {audit} from "../../../../../lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const {id}=await params,db=getDb(),[order]=await db.select().from(orders).where(and(eq(orders.id,id),eq(orders.customerEmail,user.email))).limit(1);
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  if(order.status!=="paid")return NextResponse.json({error:order.status==="provisioning"?"该额度已进入人工开通流程":"当前额度不能提取"},{status:409});
  const stock=await db.select().from(inventory).where(and(eq(inventory.product,order.product),eq(inventory.country,order.region),eq(inventory.status,"available"))).limit(order.quantity),now=new Date();
  if(stock.length===order.quantity){
    const expiresAt=new Date(now.getTime()+order.durationDays*86400000);
    for(const item of stock){await db.insert(proxyAllocations).values({id:crypto.randomUUID(),orderId:id,host:item.host,port:item.port,username:item.username,encryptedPassword:item.encryptedPassword,protocol:item.protocol,expiresAt,autoRenew:order.autoRenew,status:"active"});await db.update(inventory).set({status:"allocated",reservedByOrderId:id,updatedAt:now}).where(and(eq(inventory.id,item.id),eq(inventory.status,"available")))}
    await db.update(orders).set({status:"active",expiresAt,updatedAt:now}).where(eq(orders.id,id));
    await db.insert(notifications).values({id:crypto.randomUUID(),customerId:user.id,type:"extraction",title:"IP 已提取成功",body:`订单 ${id} 已发放 ${stock.length} 条 IP，有效期从本次提取时间开始计算。`,link:"/dashboard",read:false,createdAt:now});
    await audit({id:user.id,role:user.role},"order.auto_extract","order",id,{region:order.region,quantity:stock.length,expiresAt},req);
    return NextResponse.json({ok:true,status:"active",allocated:stock.length,expiresAt,manualRequired:false,message:`提取成功，有效期从现在开始，至 ${expiresAt.toLocaleString("zh-CN")}。`});
  }
  await db.update(orders).set({status:"provisioning",expiresAt:null,updatedAt:now}).where(eq(orders.id,id));
  await db.insert(notifications).values({id:crypto.randomUUID(),customerId:user.id,type:"extraction",title:"等待管理员手动开通",body:`库存中心只有 ${stock.length} 条可用 ${order.region} IP，需要 ${order.quantity} 条。有效期将在管理员实际发放后开始。`,link:"/dashboard",read:false,createdAt:now});
  await audit({id:user.id,role:user.role},"order.manual_extraction_required","order",id,{region:order.region,required:order.quantity,available:stock.length},req);
  return NextResponse.json({ok:true,status:"provisioning",manualRequired:true,available:stock.length,required:order.quantity,message:`库存不足，已进入人工开通流程；有效期尚未开始。`});
}
