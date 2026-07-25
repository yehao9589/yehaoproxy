import {and,desc,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {inventory,orders,proxyAllocations,serviceRequests,systemOptions} from "../../../db/schema";
import {audit} from "../../../lib/audit";
import {getCurrentCustomer} from "../../../lib/auth";

const DAY=86400000;
const integerOption=(value:unknown,fallback:number,min:number,max:number)=>{
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;
};

async function replacementPolicy(){
  const options=await getDb().select().from(systemOptions);
  const value=(key:string)=>options.find(item=>item.key===key)?.value;
  const configuredPrice=Number(value("ipReplacementPrice")??5);
  return{
    freeDays:integerOption(value("ipReplacementFreeDays"),3,0,365),
    freeCount:integerOption(value("ipReplacementFreeCount"),1,0,100),
    amount:Number.isFinite(configuredPrice)&&configuredPrice>=0?Number(configuredPrice.toFixed(2)):5,
  };
}

async function completedReplacementCount(allocationId:string){
  const rows=await getDb().select({id:serviceRequests.id}).from(serviceRequests).where(and(
    eq(serviceRequests.allocationId,allocationId),
    eq(serviceRequests.type,"replace"),
    eq(serviceRequests.status,"completed"),
  ));
  return rows.length;
}

export async function GET(req:Request){
  const user=await getCurrentCustomer();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const allocationId=new URL(req.url).searchParams.get("replacementQuote");
  const db=getDb();
  if(!allocationId){
    const items=await db.select().from(serviceRequests).where(eq(serviceRequests.customerId,user.id)).orderBy(desc(serviceRequests.createdAt)).limit(100);
    return NextResponse.json({items});
  }
  const[owned]=await db.select({allocation:proxyAllocations,order:orders}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(and(
    eq(proxyAllocations.id,allocationId),
    eq(orders.customerEmail,user.email),
    eq(proxyAllocations.status,"active"),
  )).limit(1);
  if(!owned)return NextResponse.json({error:"代理不存在或不可操作"},{status:404});
  const expiry=owned.allocation.expiresAt||owned.order.expiresAt;
  if(!expiry)return NextResponse.json({error:"该代理缺少提取时间，无法判断更换规则，请联系管理员"},{status:409});
  const policy=await replacementPolicy();
  const usedFreeCount=await completedReplacementCount(allocationId);
  const eligibleUntil=new Date(expiry.getTime()-owned.order.durationDays*DAY+policy.freeDays*DAY);
  const withinFreePeriod=new Date()<=eligibleUntil;
  const remainingFreeCount=Math.max(0,policy.freeCount-usedFreeCount);
  const free=withinFreePeriod&&remainingFreeCount>0;
  return NextResponse.json({
    free,
    amount:free?0:policy.amount,
    configuredAmount:policy.amount,
    eligibleUntil,
    freeDays:policy.freeDays,
    freeCount:policy.freeCount,
    usedFreeCount,
    remainingFreeCount,
    reason:free
      ?`提取后 ${policy.freeDays} 天免费期内，剩余 ${remainingFreeCount} 次免费更换`
      :!withinFreePeriod
        ?`已超过提取后 ${policy.freeDays} 天免费期`
        :`已使用全部 ${policy.freeCount} 次免费更换`,
  });
}

export async function POST(req:Request){
  const user=await getCurrentCustomer();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const body=await req.json().catch(()=>null),type=String(body?.type||""),allocationId=String(body?.allocationId||"");
  if(!["renew","replace"].includes(type)||!allocationId)return NextResponse.json({error:"申请参数无效"},{status:400});
  const db=getDb();
  const[owned]=await db.select({allocation:proxyAllocations,order:orders}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(and(
    eq(proxyAllocations.id,allocationId),
    eq(orders.customerEmail,user.email),
    eq(proxyAllocations.status,"active"),
  )).limit(1);
  if(!owned)return NextResponse.json({error:"代理不存在或不可操作"},{status:404});
  const[pending]=await db.select().from(serviceRequests).where(and(eq(serviceRequests.allocationId,allocationId),eq(serviceRequests.type,type as "renew"|"replace"),eq(serviceRequests.status,"pending"))).limit(1);
  if(pending)return NextResponse.json({error:"已有相同申请正在处理"},{status:409});
  const now=new Date();
  if(type==="replace"){
    const expiry=owned.allocation.expiresAt||owned.order.expiresAt;
    if(!expiry)return NextResponse.json({error:"该代理缺少提取时间，无法申请更换，请联系管理员"},{status:409});
    const reason=String(body?.reason||"").trim().slice(0,500);
    if(reason.length<5)return NextResponse.json({error:"请填写至少 5 个字的更换原因"},{status:400});
    const policy=await replacementPolicy();
    const usedFreeCount=await completedReplacementCount(allocationId);
    const eligibleUntil=new Date(expiry.getTime()-owned.order.durationDays*DAY+policy.freeDays*DAY);
    const remainingFreeCount=Math.max(0,policy.freeCount-usedFreeCount);
    if(now<=eligibleUntil&&remainingFreeCount>0){
      const id=`SR-${crypto.randomUUID().slice(0,10)}`;
      await db.insert(serviceRequests).values({id,customerId:user.id,allocationId,type:"replace",durationDays:null,reason:`${reason}（免费更换，剩余次数 ${remainingFreeCount-1}/${policy.freeCount}）`,amount:0,status:"pending",createdAt:now,updatedAt:now});
      await audit({id:user.id,role:user.role},"service.replace.free_create","service_request",id,{allocationId,eligibleUntil,freeDays:policy.freeDays,freeCount:policy.freeCount,remainingFreeCount:remainingFreeCount-1},req);
      return NextResponse.json({id,status:"pending",amount:0,free:true,remainingFreeCount:remainingFreeCount-1,message:"免费更换申请已提交"},{status:201});
    }
    const orderId=`RP-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    await db.insert(orders).values({id:orderId,customerEmail:user.email,product:"ip-replacement",region:owned.order.region,quantity:1,durationDays:0,amount:policy.amount,currency:owned.order.currency,status:"pending",paymentMethod:"balance",adminNote:`[REPLACE_ALLOCATION]${allocationId}\n[REPLACE_REASON]${reason}`,createdAt:now,updatedAt:now});
    await audit({id:user.id,role:user.role},"service.replace.order_create","order",orderId,{allocationId,reason,amount:policy.amount},req);
    return NextResponse.json({id:orderId,orderId,status:"pending",amount:policy.amount,free:false},{status:201});
  }
  const durationDays=Number(body?.durationDays);
  if(![7,30,90].includes(durationDays))return NextResponse.json({error:"续费时长无效"},{status:400});
  const[stock]=await db.select({salePrice:inventory.salePrice}).from(inventory).where(and(eq(inventory.host,owned.allocation.host),eq(inventory.port,owned.allocation.port))).limit(1);
  const multiplier=durationDays===7?.35:durationDays===30?1:2.55,amount=Number(((stock?.salePrice||0)*multiplier).toFixed(2)),id=`SR-${crypto.randomUUID().slice(0,10)}`;
  await db.insert(serviceRequests).values({id,customerId:user.id,allocationId,type:"renew",durationDays,reason:null,amount,status:"pending",createdAt:now,updatedAt:now});
  await audit({id:user.id,role:user.role},"service.renew.create","service_request",id,{allocationId,durationDays},req);
  return NextResponse.json({id,status:"pending",amount},{status:201});
}
