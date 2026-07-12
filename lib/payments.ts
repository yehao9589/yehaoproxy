export type GatewayType="stripe"|"alipay"|"wechat"|"usdt"|"paypal";
export type CheckoutInput={orderId:string;amount:number;currency:string;returnUrl:string};
export type CheckoutResult={gateway:GatewayType;externalId:string;redirectUrl?:string;qrCode?:string;expiresAt?:string};
const supported=new Set<GatewayType>(["stripe","alipay","wechat","usdt","paypal"]);
export function assertGateway(value:string):asserts value is GatewayType{if(!supported.has(value as GatewayType))throw new Error("Unsupported payment gateway")}
export async function createCheckout(gateway:GatewayType,input:CheckoutInput):Promise<CheckoutResult>{
  // Provider SDK calls are intentionally server-only. Runtime secrets are resolved
  // from the gateway's secretRef after an operator enables the channel.
  return {gateway,externalId:`pending_${input.orderId}`,redirectUrl:undefined};
}
