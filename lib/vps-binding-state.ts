export type VpsTarget = {provider:"komari"|"xpanel";serverId:string;name:string;updatedAt:string};
export type KomariNodeConfig = {uuid:string;orderId:string;total:number;direction:"sum"|"up"|"down";baselineUp:number;baselineDown:number;adjustment:number;startedAt:string};
export type BindingState = {orders:Record<string,VpsTarget[]>;komari:Record<string,KomariNodeConfig>;resetRequests?:Record<string,string>};
export function isBindableNodeOrder(order:{product:string;status:string;adminNote?:string|null}){
 return ["soft-router","computer-node"].includes(order.product)&&["paid","provisioning","active"].includes(order.status)&&!order.adminNote?.includes("[RENEWAL_OF]")&&!order.adminNote?.includes("[BUNDLE_RENEWAL]true");
}
export class BindingSwitchRequired extends Error {
 confirmation:string;
 current:VpsTarget[];
 constructor(confirmation:string, current:VpsTarget[], target:VpsTarget|null){
  super(`该订单当前绑定：${current.map(v=>`${v.provider==="komari"?"Komari":"X-Panel"} / ${v.name}`).join("、")||"无（绑定已变更）"}。确认${target?`切换为 ${target.provider==="komari"?"Komari":"X-Panel"} / ${target.name}`:"解除绑定"}？原绑定将解除，历史流量记录保留。`);
  this.confirmation=confirmation;this.current=current;
 }
}
export function replaceOrderBinding(state:BindingState,orderId:string,target:VpsTarget|null,confirmation?:string){
 const current=state.orders[orderId]||[];
 const same=current.length===1&&target&&current[0].provider===target.provider&&current[0].serverId===target.serverId;
 if(same)return;
 // The token includes the previous update time: stale confirmations cannot overwrite another administrator's change.
 if((current.length||confirmation!==undefined)&&confirmation!==JSON.stringify(current))throw new BindingSwitchRequired(JSON.stringify(current),current,target);
 if(target&&Object.entries(state.orders).some(([id,items])=>id!==orderId&&items.some(v=>v.provider===target.provider&&v.serverId===target.serverId)))throw new Error("所选 VPS 已绑定其他订单，请先处理该订单，不能直接抢占。");
 state.orders[orderId]=target?[target]:[];
}
