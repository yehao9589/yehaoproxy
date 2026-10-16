export type UnpaidOrderPolicy={enabled:boolean;hours:number};
export const DEFAULT_UNPAID_ORDER_POLICY:UnpaidOrderPolicy={enabled:true,hours:48};
export function normalizeUnpaidOrderPolicy(value:unknown):UnpaidOrderPolicy{const v=value as Partial<UnpaidOrderPolicy>|null;return {enabled:typeof v?.enabled==="boolean"?v.enabled:true,hours:Number.isInteger(v?.hours)&&Number(v?.hours)>=1&&Number(v?.hours)<=8760?Number(v?.hours):48}}
export function unpaidDeadline(createdAt:Date,policy:UnpaidOrderPolicy){return policy.enabled?new Date(createdAt.getTime()+policy.hours*3600000):null}
export function unpaidOrderExpired(order:{status:string;createdAt:Date},policy:UnpaidOrderPolicy,now=new Date()){const deadline=unpaidDeadline(order.createdAt,policy);return order.status==="pending"&&!!deadline&&deadline<=now}
