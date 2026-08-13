import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {orders,paymentGateways,paymentTransactions} from "../../../../db/schema";
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
  const key=`${order.id}:${gateway}`,[existing]=await db.select().from(paymentTransactions).where(eq(paymentTransactions.idempotencyKey,key)).limit(1);
  if(existing?.status==="succeeded")return NextResponse.json({transactionId:existing.id,status:existing.status});
  try{
    const origin=String(process.env.PUBLIC_APP_URL||new URL(req.url).origin).replace(/\/$/,""),payAmount=await convertCurrency(order.amount,order.currency,"CNY"),result=await createAlipayCheckout(await readAlipayConfig(config),{orderId:order.id,amount:payAmount,subject:`YehaoProxy 订单 ${order.id}`,origin,mobile:/Mobile|Android|iPhone|iPad/i.test(req.headers.get("user-agent")||"")}),now=new Date(),id=existing?.id||`PAY-${crypto.randomUUID().slice(0,10)}`;
    if(existing)await db.update(paymentTransactions).set({externalId:result.externalId,amount:payAmount,currency:"CNY",status:"created",updatedAt:now}).where(eq(paymentTransactions.id,existing.id));
    else await db.insert(paymentTransactions).values({id,orderId:order.id,gatewayId:config.id,externalId:result.externalId,amount:payAmount,currency:"CNY",status:"created",idempotencyKey:key,createdAt:now,updatedAt:now});
    return NextResponse.json({transactionId:id,...result,payAmount,currency:"CNY"},{status:existing?200:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"创建支付宝支付失败"},{status:502})}
}
