import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {orders,paymentGateways,paymentTransactions,wallets} from "../../../../db/schema";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getCreditSummary} from "../../../../lib/credit";
import {createAlipayCheckout,readAlipayConfig} from "../../../../lib/alipay";
import {nextBusinessId} from "../../../../lib/business-id";

export async function POST(req:Request){
 const user=await getCurrentCustomer();
 if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const body=await req.json().catch(()=>null),requested=Number(body?.amount);
 if(!Number.isFinite(requested)||requested<=0||requested>100000)return NextResponse.json({error:"请输入有效还款金额"},{status:400});
 if(body?.gateway!=="alipay")return NextResponse.json({error:"该支付通道暂不支持在线还款"},{status:409});
 const db=getDb(),summary=await getCreditSummary(user.id),[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,user.id)).limit(1);
 if(!wallet||wallet.currency!=="CNY")return NextResponse.json({error:"支付宝还款目前仅支持人民币账户"},{status:409});
 const amount=Math.min(Math.round(requested*100)/100,summary.creditUsed);
 if(amount<=0)return NextResponse.json({error:"当前没有待还款金额"},{status:409});
 const [config]=await db.select().from(paymentGateways).where(eq(paymentGateways.type,"alipay")).limit(1);
 if(!config?.enabled)return NextResponse.json({error:"该支付通道暂未开通"},{status:409});
 const now=new Date(),id=await nextBusinessId("RC",now);
 try{
  const origin=String(process.env.PUBLIC_APP_URL||new URL(req.url).origin).replace(/\/$/,"");
  const checkout=await createAlipayCheckout(await readAlipayConfig(config),{orderId:id,amount,subject:`信用账单还款 ${id}`,origin,mobile:/Mobile|Android|iPhone|iPad/i.test(req.headers.get("user-agent")||""),returnPath:"/dashboard?tab=credit-bills&payment_return=alipay"});
  await db.batch([
   db.insert(orders).values({id,customerEmail:user.email,product:"wallet-topup",region:"BALANCE",quantity:1,durationDays:30,amount,currency:"CNY",status:"pending",paymentMethod:"alipay",adminNote:"[CREDIT_REPAYMENT]true",createdAt:now,updatedAt:now}),
   db.insert(paymentTransactions).values({id:await nextBusinessId("PT",now),orderId:id,gatewayId:config.id,externalId:checkout.externalId,amount,currency:"CNY",status:"created",idempotencyKey:`${id}:alipay`,createdAt:now,updatedAt:now})
  ]);
  return NextResponse.json({ok:true,orderId:id,...checkout},{status:201});
 }catch{return NextResponse.json({error:"创建还款支付失败，请稍后重试或联系管理员"},{status:502})}
}
