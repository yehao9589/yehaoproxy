import {eq} from "drizzle-orm";
import {getDb} from "../../../../../db";
import {paymentGateways} from "../../../../../db/schema";
import {readAlipayConfig,verifyAlipay} from "../../../../../lib/alipay";
import {systemAudit} from "../../../../../lib/audit";
import {completeOnlinePayment} from "../../../../../lib/online-payment";

const response=(value:"success"|"failure")=>new Response(value,{status:200,headers:{"content-type":"text/plain;charset=utf-8"}});
export async function POST(req:Request){const form=await req.formData(),params=Object.fromEntries([...form.entries()].map(([key,value])=>[key,String(value)])),db=getDb(),[gateway]=await db.select().from(paymentGateways).where(eq(paymentGateways.type,"alipay")).limit(1);if(!gateway?.enabled)return response("failure");try{const config=await readAlipayConfig(gateway);if(!await verifyAlipay(params,config.alipayPublicKey))throw new Error("支付宝通知验签失败");if(params.app_id!==config.appId)throw new Error("支付宝通知应用 ID 不一致");if(!["TRADE_SUCCESS","TRADE_FINISHED"].includes(params.trade_status||""))return response("success");const amount=Number(params.total_amount);if(!params.out_trade_no||!params.trade_no||!Number.isFinite(amount))throw new Error("支付宝通知参数不完整");const result=await completeOnlinePayment({orderId:params.out_trade_no,gatewayId:gateway.id,tradeNo:params.trade_no,paidAmount:amount});await systemAudit("payment.alipay.success","order",params.out_trade_no,{tradeNo:params.trade_no,amount,duplicate:result.duplicate});return response("success")}catch(error){await systemAudit("payment.alipay.failed","order",params.out_trade_no||null,{error:error instanceof Error?error.message:"支付宝回调处理失败",tradeNo:params.trade_no||null});return response("failure")}}
