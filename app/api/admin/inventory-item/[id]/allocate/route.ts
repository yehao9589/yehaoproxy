import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../../lib/admin-auth";
import {getDb} from "../../../../../../db";
import {inventory,orders,proxyAllocations} from "../../../../../../db/schema";
import {audit} from "../../../../../../lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await requireAdminApi("inventory");
  if(!admin)return NextResponse.json({error:"无库存管理权限"},{status:403});
  const{id}=await params,body=await req.json().catch(()=>null),orderId=String(body?.orderId||"");
  if(!orderId)return NextResponse.json({error:"请选择需要分发的客户订单"},{status:400});
  const db=getDb(),[stock]=await db.select().from(inventory).where(eq(inventory.id,id)).limit(1);
  if(!stock)return NextResponse.json({error:"库存资源不存在"},{status:404});
  if(stock.status!=="available")return NextResponse.json({error:"只有可售库存可以分发"},{status:409});
  const[order]=await db.select().from(orders).where(eq(orders.id,orderId)).limit(1);
  if(!order||!["paid","provisioning"].includes(order.status))return NextResponse.json({error:"所选订单不存在或不在待开通状态"},{status:409});
  if(order.product!==stock.product||order.region!==stock.country)return NextResponse.json({error:"库存商品或地区与订单不匹配"},{status:409});
  const allocated=await db.select({id:proxyAllocations.id}).from(proxyAllocations).where(and(eq(proxyAllocations.orderId,order.id),eq(proxyAllocations.status,"active")));
  if(allocated.length>=order.quantity)return NextResponse.json({error:"该订单所需资源已全部分发"},{status:409});
  const now=new Date(),expiresAt=new Date(now.getTime()+Math.max(1,order.durationDays)*86400000);
  const allocationId=crypto.randomUUID();
  await db.insert(proxyAllocations).values({
    id:allocationId,orderId:order.id,host:stock.host,port:stock.port,
    username:stock.username,encryptedPassword:stock.encryptedPassword,
    protocol:stock.protocol,expiresAt,autoRenew:order.autoRenew,status:"active"
  });
  await db.update(inventory).set({status:"allocated",reservedByOrderId:order.id,expiresAt,updatedAt:now}).where(and(eq(inventory.id,id),eq(inventory.status,"available")));
  const completed=allocated.length+1>=order.quantity;
  await db.update(orders).set({status:completed?"active":"provisioning",expiresAt:completed?expiresAt:order.expiresAt,updatedAt:now}).where(eq(orders.id,order.id));
  await audit({id:admin.id,role:admin.role},"inventory.allocate","inventory",id,{orderId:order.id,customerEmail:order.customerEmail,allocationId},req);
  return NextResponse.json({ok:true,allocationId,orderStatus:completed?"active":"provisioning"});
}
