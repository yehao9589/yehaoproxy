import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getDb} from "../../../../db";
import {orders,proxyAllocations} from "../../../../db/schema";
import {audit} from "../../../../lib/audit";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const{id}=await params,b=await req.json().catch(()=>null),db=getDb();
  const lookup=id==="by-address"?and(eq(proxyAllocations.host,String(b?.host||"")),eq(proxyAllocations.port,Number(b?.port)),eq(orders.customerEmail,user.email)):and(eq(proxyAllocations.id,id),eq(orders.customerEmail,user.email));
  const[owned]=await db.select({allocation:proxyAllocations}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(lookup).limit(1);
  if(!owned)return NextResponse.json({error:"代理不存在"},{status:404});
  const updates:{note?:string|null;autoRenew?:boolean}={};
  if(b.note!==undefined)updates.note=String(b.note).slice(0,200)||null;
  if(b.autoRenew!==undefined)updates.autoRenew=Boolean(b.autoRenew);
  let renewalDays:number|undefined;
  if(b.renewalDays!==undefined){renewalDays=Number(b.renewalDays);if(![7,30,90].includes(renewalDays))return NextResponse.json({error:"默认续费时长无效"},{status:400})}
  if(!Object.keys(updates).length&&renewalDays===undefined)return NextResponse.json({error:"没有可修改内容"},{status:400});
  if(Object.keys(updates).length)await db.update(proxyAllocations).set(updates).where(eq(proxyAllocations.id,owned.allocation.id));
  if(renewalDays!==undefined)await db.update(orders).set({durationDays:renewalDays,updatedAt:new Date()}).where(eq(orders.id,owned.allocation.orderId));
  await audit({id:user.id,role:user.role},"proxy.update","proxy",owned.allocation.id,{...updates,renewalDays},req);
  return NextResponse.json({ok:true,renewalDays});
}
