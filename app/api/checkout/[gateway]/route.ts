import {and,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {couponRedemptions,coupons,orders,paymentGateways,paymentTransactions} from "../../../../db/schema";
import {createAlipayCheckout,readAlipayConfig} from "../../../../lib/alipay";
import {getCurrentCustomer} from "../../../../lib/auth";
import {convertCurrency} from "../../../../lib/currency-conversion";
import {assertGateway,gatewayRuntimeSupported} from "../../../../lib/payments";

export async function POST(req:Request,{params}:{params:Promise<{gateway:string}>}){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const{gateway}=await params;try{assertGateway(gateway)}catch{return NextResponse.json({error:"支付渠道不支持"},{status:404})}
  if(!gatewayRuntimeSupported(gateway))return NextResponse.json({error:"该支付渠道尚未完成生产接入，请使用余额支付"},{status:409});
  const body=await req.json().catch(()=>null);if(!body?.orderId)return NextResponse.json({error:"缺少订单号"},{status:400});
  const db=getDb(),[order]=await db.select().from(orders).where(eq(orders.id,String(body.orderId))).limit(1),[config]=await db.select().from(paymentGateways).where(eq(paymentGateways.type,gateway)).limit(1);
  if(!order||order.customerEmail!==user.email)return NextResponse.json({error:"订单不存在"},{status:404});
  if(order.status!=="pending")return NextResponse.json({error:"当前订单不能重复支付"},{status:409});
  if(!config?.enabled)return NextResponse.json({error:"该支付渠道暂未开通"},{status:409});
  const couponCode=String(body?.couponCode||"").trim().toUpperCase();
  const[existingRedemption]=await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId,order.id)).limit(1);
  let coupon:null|typeof coupons.$inferSelect=null,discount=0,payable=order.amount;
  if(couponCode&&!existingRedemption){
    [coupon]=await db.select().from(coupons).where(eq(coupons.code,couponCode)).limit(1);const currentTime=new Date();
    if(!coupon||!coupon.enabled||(coupon.startsAt&&coupon.startsAt>currentTime)||(coupon.expiresAt&&coupon.expiresAt<currentTime)||(coupon.totalLimit!==null&&coupon.usedCount>=coupon.totalLimit)||order.amount<coupon.minAmount)return NextResponse.json({error:"优惠码不可用"},{status:400});
    discount=coupon.type==="fixed"?coupon.value:(order.amount*coupon.value)/100;if(coupon.maxDiscount!==null)discount=Math.min(discount,coupon.maxDiscount);discount=Math.min(order.amount,Number(discount.toFixed(2)));payable=Number((order.amount-discount).toFixed(2));
  }
  const key=`${order.id}:${gateway}`,[existing]=await db.select().from(paymentTransactions).where(eq(paymentTransactions.idempotencyKey,key)).limit(1);
  if(existing?.status==="succeeded")return NextResponse.json({transactionId:existing.id,status:existing.status});
  try{
    const origin=String(process.env.PUBLIC_APP_URL||new URL(req.url).origin).replace(/\/$/,""),payAmount=await convertCurrency(payable,order.currency,"CNY"),result=await createAlipayCheckout(await readAlipayConfig(config),{orderId:order.id,amount:payAmount,subject:`YehaoProxy 订单 ${order.id}`,origin,mobile:/Mobile|Android|iPhone|iPad/i.test(req.headers.get("user-agent")||"")}),now=new Date(),id=existing?.id||`PAY-${crypto.randomUUID().slice(0,10)}`;
    type Q=Parameters<typeof db.batch>[0][number];const writes:Q[]=[existing?db.update(paymentTransactions).set({externalId:result.externalId,amount:payAmount,currency:"CNY",status:"created",updatedAt:now}).where(eq(paymentTransactions.id,existing.id)):db.insert(paymentTransactions).values({id,orderId:order.id,gatewayId:config.id,externalId:result.externalId,amount:payAmount,currency:"CNY",status:"created",idempotencyKey:key,createdAt:now,updatedAt:now})];
    if(coupon&&!existingRedemption){writes.push(db.update(orders).set({amount:payable,updatedAt:now}).where(and(eq(orders.id,order.id),eq(orders.amount,order.amount))));writes.push(db.insert(couponRedemptions).values({id:crypto.randomUUID(),couponId:coupon.id,customerId:user.id,orderId:order.id,discount,createdAt:now}));writes.push(db.update(coupons).set({usedCount:coupon.usedCount+1}).where(and(eq(coupons.id,coupon.id),eq(coupons.usedCount,coupon.usedCount))))}
    await db.batch(writes as[Q,...Q[]]);
    return NextResponse.json({transactionId:id,...result,payAmount,currency:"CNY",discount,orderAmount:payable},{status:existing?200:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"创建支付宝支付失败"},{status:502})}
}
