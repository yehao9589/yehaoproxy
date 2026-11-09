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

/** Preview the next unprocessed boundary without applying a reset. */
export function scheduledTrafficResetAt(previous:TrafficCycle,order:{orderId:string;expiresAt:string|null}){
 if(!order.expiresAt||!Number.isFinite(Date.parse(order.expiresAt)))return null;
 const cycle=advanceTrafficCycle(previous,{orderId:order.orderId,expiresAt:order.expiresAt},Number.NEGATIVE_INFINITY);
 const boundary=Date.parse(cycle.boundOrderExpiry);
 return Number.isFinite(boundary)&&cycle.boundOrderExpiry!==cycle.lastOrderExpiryReset?new Date(boundary).toISOString():null;
}
