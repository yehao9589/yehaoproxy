type OrderLink={id:string;adminNote?:string|null};
type AllocationLink={id:string;orderId:string};
export const orderMarker=(note:string|null|undefined,key:string)=>String(note||"").split("\n").find(line=>line.startsWith("["+key+"]"))?.slice(key.length+2).trim()||"";
/** Inputs must already be restricted to the authenticated customer's records. */
export function resourcesForOrder<T extends AllocationLink>(order:OrderLink,orders:OrderLink[],allocations:T[],seen=new Set<string>()):T[]{
 if(seen.has(order.id))return [];
 const visited=new Set(seen).add(order.id);
 const allocationId=orderMarker(order.adminNote,"RENEW_ALLOCATION")||orderMarker(order.adminNote,"REPLACE_ALLOCATION");
 const sourceId=orderMarker(order.adminNote,"RENEWAL_OF");
 if(allocationId)return allocations.filter(a=>a.id===allocationId&&(!sourceId||a.orderId===sourceId));
 const children=orders.filter(o=>orderMarker(o.adminNote,"BUNDLE_PARENT")===order.id);
 if(children.length)return [...new Map(children.flatMap(o=>resourcesForOrder(o,orders,allocations,visited)).map(a=>[a.id,a])).values()];
 if(sourceId)return orders.some(o=>o.id===sourceId)?allocations.filter(a=>a.orderId===sourceId):[];
 return allocations.filter(a=>a.orderId===order.id);
}
