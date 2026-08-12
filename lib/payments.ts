export type GatewayType="stripe"|"alipay"|"wechat"|"usdt"|"paypal";
export type CheckoutInput={orderId:string;amount:number;currency:string;returnUrl:string};
export type CheckoutResult={gateway:GatewayType;externalId:string;redirectUrl?:string;qrCode?:string;expiresAt?:string};
const supported=new Set<GatewayType>(["stripe","alipay","wechat","usdt","paypal"]);
export function assertGateway(value:string):asserts value is GatewayType{if(!supported.has(value as GatewayType))throw new Error("Unsupported payment gateway")}
export function gatewayRuntimeSupported(_gateway:GatewayType){return false}
export async function createCheckout(gateway:GatewayType,input:CheckoutInput):Promise<CheckoutResult>{
  void input;
  throw new Error(`${gateway} 支付适配器尚未完成签名与回调验签，不能用于真实收款`);
}
