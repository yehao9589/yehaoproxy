import{NextResponse}from"next/server";
import{and,eq,inArray}from"drizzle-orm";
import{getCurrentCustomer}from"../../../../lib/auth";
import{getDb}from"../../../../db";
import{orders,proxyAllocations,serviceRequests}from"../../../../db/schema";
import{encryptCredential}from"../../../../lib/inventory-crypto";
import{audit}from"../../../../lib/audit";

export async function POST(req:Request){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const b=await req.json().catch(()=>null),ids=[...new Set((Array.isArray(b?.ids)?b.ids:[]).map(String))].slice(0,200),action=String(b?.action||"");
  if(!ids.length)return NextResponse.json({error:"请选择代理"},{status:400});
  const db=getDb(),owned=await db.select({allocation:proxyAllocations}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(and(eq(orders.customerEmail,user.email),inArray(proxyAllocations.id,ids),eq(proxyAllocations.status,"active")));
  if(owned.length!==ids.length)return NextResponse.json({error:"部分代理不存在或不属于当前账户"},{status:403});
  if(action==="credentials"){
    const username=String(b?.username||"").trim()||null,password=String(b?.password||"");
    if(!username&&!password)return NextResponse.json({error:"请填写新用户名或密码"},{status:400});
    const updates:any={};if(username)updates.username=username;if(password)updates.encryptedPassword=await encryptCredential(password);
    await db.update(proxyAllocations).set(updates).where(inArray(proxyAllocations.id,ids));
    await audit({id:user.id,role:user.role},"proxy.bulk_credentials","proxy",null,{ids,count:ids.length,usernameChanged:!!username,passwordChanged:!!password},req);
    return NextResponse.json({ok:true,updated:ids.length});
  }
  if(action==="renew"){
    const durationDays=Number(b?.durationDays);if(![7,30,90].includes(durationDays))return NextResponse.json({error:"续费时长无效"},{status:400});
    const now=new Date();for(const id of ids)await db.insert(serviceRequests).values({id:crypto.randomUUID(),customerId:user.id,allocationId:id,type:"renew",durationDays,reason:"客户批量续费申请",amount:null,status:"pending",createdAt:now,updatedAt:now});
    await audit({id:user.id,role:user.role},"proxy.bulk_renew_request","proxy",null,{ids,count:ids.length,durationDays},req);
    return NextResponse.json({ok:true,created:ids.length});
  }
  if(action==="auto-renew"){
    const enabled=b?.enabled===true;await db.update(proxyAllocations).set({autoRenew:enabled}).where(inArray(proxyAllocations.id,ids));
    return NextResponse.json({ok:true,updated:ids.length});
  }
  return NextResponse.json({error:"不支持的批量操作"},{status:400});
}
