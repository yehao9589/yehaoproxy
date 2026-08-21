import {and,desc,eq,inArray} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {orders,productOffers,proxyAllocations,serviceRequests,systemOptions} from "../../../db/schema";
import {audit} from "../../../lib/audit";
import {getCurrentCustomer} from "../../../lib/auth";

const DAY=86400000;
const originalActivation=(allocation:{note:string|null},order:{createdAt:Date})=>{const marked=allocation.note?.match(/\[ACTIVATED_AT\]([^\n]+)/)?.[1],parsed=marked?new Date(marked):order.createdAt;return Number.isNaN(parsed.getTime())?order.createdAt:parsed};
const integerOption=(value:unknown,fallback:number,min:number,max:number)=>{
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;
};

async function replacementPolicy(product:string,region:string){
  const db=getDb();
  const[options,offers]=await Promise.all([db.select().from(systemOptions),db.select().from(productOffers)]);
  const offer=offers.find(item=>item.product===product&&(item.region===region||item.regionName===region));
  const value=(key:string)=>options.find(item=>item.key===`productPolicy:${offer?.id}:${key}`)?.value||options.find(item=>item.key===key)?.value;
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
async function hasCompletedRenewal(allocationId:string){const rows=await getDb().select({adminNote:orders.adminNote}).from(orders).where(inArray(orders.status,["paid","provisioning","active"]));return rows.some(row=>row.adminNote?.includes(`[RENEW_ALLOCATION]${allocationId}`))}

export async function GET(req:Request){
  const user=await getCurrentCustomer();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const allocationId=new URL(req.url).searchParams.get("replacementQuote");
  const db=getDb();
  if(!allocationId){
    const[items,ownedAllocations,ownedOrders]=await Promise.all([
      db.select().from(serviceRequests).where(eq(serviceRequests.customerId,user.id)).orderBy(desc(serviceRequests.createdAt)).limit(100),
      db.select({allocation:proxyAllocations,order:orders}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(eq(orders.customerEmail,user.email)),
      db.select().from(orders).where(eq(orders.customerEmail,user.email)),
    ]);
    const allocationMap=new Map(ownedAllocations.map(row=>[row.allocation.id,row]));
    const orderMap=new Map(ownedOrders.map(order=>[order.id,order]));
    const enriched=items.map(item=>{const proxy=allocationMap.get(item.allocationId),order=proxy?.order||orderMap.get(item.allocationId)||null,allocation=proxy?.allocation||null,node=Boolean(order&&["computer-node","soft-router"].includes(order.product));return{...item,service:order?{kind:node?"node":"proxy",orderId:order.id,product:order.product,region:order.region,address:allocation?`${allocation.host}:${allocation.port}`:null,wifiName:allocation?.wifiName||null,city:allocation?.note?.match(/\[CITY\]([^\n]*)/)?.[1]?.trim()||null}:null}});
    return NextResponse.json({items:enriched});
  }
  const[owned]=await db.select({allocation:proxyAllocations,order:orders}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).where(and(
    eq(proxyAllocations.id,allocationId),
    eq(orders.customerEmail,user.email),
    eq(proxyAllocations.status,"active"),
  )).limit(1);
  if(!owned)return NextResponse.json({error:"代理不存在或不可操作"},{status:404});
  const expiry=owned.allocation.expiresAt||owned.order.expiresAt;
  if(!expiry)return NextResponse.json({error:"该代理缺少开通时间，无法判断更换规则，请联系管理员"},{status:409});
  if(expiry.getTime()<=Date.now())return NextResponse.json({error:"代理服务已到期，不能申请更换，请先续费"},{status:409});
  const policy=await replacementPolicy(owned.order.product,owned.order.region);
  const[usedFreeCount,renewed]=await Promise.all([completedReplacementCount(allocationId),hasCompletedRenewal(allocationId)]);
  const eligibleUntil=new Date(originalActivation(owned.allocation,owned.order).getTime()+policy.freeDays*DAY);
  const withinFreePeriod=new Date()<=eligibleUntil;
  const remainingFreeCount=Math.max(0,policy.freeCount-usedFreeCount);
  const free=!renewed&&withinFreePeriod&&remainingFreeCount>0;
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
      ?`开通后 ${policy.freeDays} 天免费期内，剩余 ${remainingFreeCount} 次免费更换`
      :renewed
        ?"该代理已经续费，续费服务不享受免费更换"
        :!withinFreePeriod
        ?`已超过开通后 ${policy.freeDays} 天免费期`
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
    if(!expiry)return NextResponse.json({error:"该代理缺少开通时间，无法申请更换，请联系管理员"},{status:409});
    if(expiry.getTime()<=now.getTime())return NextResponse.json({error:"代理服务已到期，不能申请更换，请先续费"},{status:409});
    const reason=String(body?.reason||"").trim().slice(0,500);
    if(reason.length<5)return NextResponse.json({error:"请填写至少 5 个字的更换原因"},{status:400});
    const policy=await replacementPolicy(owned.order.product,owned.order.region);
    const[usedFreeCount,renewed]=await Promise.all([completedReplacementCount(allocationId),hasCompletedRenewal(allocationId)]);
    const eligibleUntil=new Date(originalActivation(owned.allocation,owned.order).getTime()+policy.freeDays*DAY);
    const remainingFreeCount=Math.max(0,policy.freeCount-usedFreeCount);
    if(!renewed&&now<=eligibleUntil&&remainingFreeCount>0){
      const id=`SR-${crypto.randomUUID().slice(0,10)}`;
      const orderId=`FR-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
      await db.insert(serviceRequests).values({id,customerId:user.id,allocationId,type:"replace",durationDays:null,reason:`${reason}（免费更换，剩余次数 ${remainingFreeCount-1}/${policy.freeCount}）`,amount:0,status:"pending",createdAt:now,updatedAt:now});
      await db.insert(orders).values({id:orderId,customerEmail:user.email,product:"ip-replacement",region:owned.order.region,quantity:1,durationDays:0,amount:0,currency:owned.order.currency,status:"provisioning",paymentMethod:"free",adminNote:`[REPLACE_ALLOCATION]${allocationId}\n[REPLACE_REASON]${reason}\n[FREE_REPLACEMENT_REQUEST]${id}`,createdAt:now,updatedAt:now});
      await audit({id:user.id,role:user.role},"service.replace.free_create","service_request",id,{allocationId,eligibleUntil,freeDays:policy.freeDays,freeCount:policy.freeCount,remainingFreeCount:remainingFreeCount-1},req);
      return NextResponse.json({id,orderId,status:"pending",amount:0,free:true,remainingFreeCount:remainingFreeCount-1,message:"免费更换申请及订单已创建"},{status:201});
    }
    const orderId=`RP-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    await db.insert(orders).values({id:orderId,customerEmail:user.email,product:"ip-replacement",region:owned.order.region,quantity:1,durationDays:0,amount:policy.amount,currency:owned.order.currency,status:"pending",paymentMethod:"balance",adminNote:`[REPLACE_ALLOCATION]${allocationId}\n[REPLACE_REASON]${reason}`,createdAt:now,updatedAt:now});
    await audit({id:user.id,role:user.role},"service.replace.order_create","order",orderId,{allocationId,reason,amount:policy.amount},req);
    return NextResponse.json({id:orderId,orderId,status:"pending",amount:policy.amount,free:false},{status:201});
  }
  const durationDays=Number(body?.durationDays);
  if(![7,30,90,180].includes(durationDays))return NextResponse.json({error:"续费时长无效"},{status:400});
  const multiplier=durationDays===7?.35:durationDays===30?1:2.55,basePrice=owned.order.renewalAmount??owned.order.amount/Math.max(1,owned.order.quantity),amount=Number((basePrice*multiplier).toFixed(2)),id=`SR-${crypto.randomUUID().slice(0,10)}`;
  await db.insert(serviceRequests).values({id,customerId:user.id,allocationId,type:"renew",durationDays,reason:null,amount,status:"pending",createdAt:now,updatedAt:now});
  await audit({id:user.id,role:user.role},"service.renew.create","service_request",id,{allocationId,durationDays},req);
  return NextResponse.json({id,status:"pending",amount},{status:201});
}
