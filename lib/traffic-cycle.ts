export type TrafficCycle={boundOrderId?:string;boundOrderExpiry?:string;lastOrderExpiryReset?:string};
/** Manual traffic resets must not modify these service-boundary fields. */
export function advanceTrafficCycle(previous:TrafficCycle,order:{orderId:string;expiresAt:string},now:number){
 const changed=previous.boundOrderId!==order.orderId;
 let boundary=changed?order.expiresAt:previous.boundOrderExpiry||order.expiresAt;
 let last=changed?undefined:previous.lastOrderExpiryReset;
 // A renewal after an already processed expiry must establish the next boundary.
 if(last===boundary&&Date.parse(order.expiresAt)>Date.parse(boundary))boundary=order.expiresAt;
 const reset=Number.isFinite(Date.parse(boundary))&&now>=Date.parse(boundary)&&last!==boundary;
 if(reset){last=boundary;if(Date.parse(order.expiresAt)>Date.parse(boundary))boundary=order.expiresAt;}
 return {reset,boundOrderId:order.orderId,boundOrderExpiry:boundary,lastOrderExpiryReset:last};
}
