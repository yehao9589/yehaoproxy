import {decryptCredential} from "./inventory-crypto";

const gateway="https://openapi.alipay.com/gateway.do";
type AlipayConfig={appId:string;privateKey:string;alipayPublicKey:string;pageEnabled:boolean;wapEnabled:boolean;precreateEnabled:boolean};
const encoder=new TextEncoder();
function pemBody(value:string){return value.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g,"")}
function bytes(value:string){const raw=atob(pemBody(value));return Uint8Array.from(raw,char=>char.charCodeAt(0))}
function base64(value:ArrayBuffer){let raw="";for(const byte of new Uint8Array(value))raw+=String.fromCharCode(byte);return btoa(raw)}
function canonical(params:Record<string,string>,excludeSignType=false){return Object.entries(params).filter(([key,value])=>key!=="sign"&&(!excludeSignType||key!=="sign_type")&&value!=="").sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join("&")}
export async function readAlipayConfig(row:{secretRef:string|null;webhookSecretRef:string|null;configuration:string|null}){
  let config:Record<string,unknown>={};try{config=JSON.parse(row.configuration||"{}")||{}}catch{}
  const privateKey=await decryptCredential(row.secretRef),alipayPublicKey=await decryptCredential(row.webhookSecretRef);
  if(!config.appId||!privateKey||!alipayPublicKey)throw new Error("支付宝应用 ID、应用私钥或支付宝公钥未配置完整");
  return{appId:String(config.appId),privateKey,alipayPublicKey,pageEnabled:config.pageEnabled!==false,wapEnabled:config.wapEnabled!==false,precreateEnabled:Boolean(config.precreateEnabled)} satisfies AlipayConfig;
}
async function sign(params:Record<string,string>,privateKey:string){const key=await crypto.subtle.importKey("pkcs8",bytes(privateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);return base64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(canonical(params))))}
export async function verifyAlipay(params:Record<string,string>,publicKey:string){const signature=params.sign;if(!signature)return false;const key=await crypto.subtle.importKey("spki",bytes(publicKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,bytes(signature).buffer,encoder.encode(canonical(params,true)))}
export async function createAlipayCheckout(config:AlipayConfig,input:{orderId:string;amount:number;subject:string;origin:string;mobile:boolean}){
  const method=input.mobile&&config.wapEnabled?"alipay.trade.wap.pay":config.pageEnabled?"alipay.trade.page.pay":config.wapEnabled?"alipay.trade.wap.pay":"";
  if(!method)throw new Error("支付宝电脑网站支付和手机网站支付均未开启");
  const params:Record<string,string>={app_id:config.appId,method,format:"JSON",charset:"utf-8",sign_type:"RSA2",timestamp:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}),version:"1.0",notify_url:`${input.origin}/api/payments/alipay/notify`,return_url:`${input.origin}/dashboard?tab=orders&payment_return=alipay`,biz_content:JSON.stringify({out_trade_no:input.orderId,total_amount:input.amount.toFixed(2),subject:input.subject.slice(0,256),product_code:method==="alipay.trade.wap.pay"?"QUICK_WAP_WAY":"FAST_INSTANT_TRADE_PAY",timeout_express:"30m"})};
  params.sign=await sign(params,config.privateKey);const query=new URLSearchParams(params);return{gateway:"alipay" as const,externalId:input.orderId,redirectUrl:`${gateway}?${query.toString()}`};
}

export async function createAlipayRefund(config:AlipayConfig,input:{orderId:string;amount:number;reason:string;requestId:string}){
  const params:Record<string,string>={app_id:config.appId,method:"alipay.trade.refund",format:"JSON",charset:"utf-8",sign_type:"RSA2",timestamp:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}),version:"1.0",biz_content:JSON.stringify({out_trade_no:input.orderId,refund_amount:input.amount.toFixed(2),refund_reason:input.reason.slice(0,256),out_request_no:input.requestId})};
  params.sign=await sign(params,config.privateKey);
  const response=await fetch(gateway,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded;charset=utf-8"},body:new URLSearchParams(params)});
  const data=await response.json().catch(()=>null),result=data?.alipay_trade_refund_response;
  if(!response.ok||!result||result.code!=="10000")throw new Error(result?.sub_msg||result?.msg||`支付宝退款请求失败（${response.status}）`);
  return{tradeNo:String(result.trade_no||""),refundFee:Number(result.refund_fee||input.amount),buyerLogonId:String(result.buyer_logon_id||"")};
}
