import {eq} from "drizzle-orm";
import {getDb,getRawDatabase} from "../db";
import {orders,systemOptions} from "../db/schema";
import {isBindableNodeOrder,type BindingState,type KomariNodeConfig,type VpsTarget} from "./vps-binding-state";
import {replaceOrderBinding} from "./vps-binding-state";
import {createServiceTraffic,sampleServiceTraffic,switchServiceTraffic,resetServiceTrafficState,advanceServiceTrafficCycle,freshTrafficSnapshot,type TrafficDirection} from "./service-traffic-state";
import {serviceTrafficSnapshot,hydrateServiceTraffic,legacyTraffic} from "./service-traffic-migration";
export {BindingSwitchRequired} from "./vps-binding-state";
const KEY="vps_bindings_v1";
export async function getVpsBindingState():Promise<BindingState>{
 const rows=await getDb().select().from(systemOptions),values=new Map(rows.map(r=>[r.key,r.value]));
 if(values.has(KEY)){const state=JSON.parse(values.get(KEY)!) as BindingState;hydrateServiceTraffic(state,values);return state;}
 const komari:Record<string,KomariNodeConfig>=values.has("komari_bindings")?JSON.parse(values.get("komari_bindings")!):Object.fromEntries(rows.filter(r=>r.key.startsWith("komari_node:")).map(r=>[r.key.slice(12),JSON.parse(r.value)]));
 const state:BindingState={orders:{},komari};
 const nodes=JSON.parse(values.get("komari_nodes")||"[]") as {uuid:string;name:string}[];
 const servers=JSON.parse(values.get("xpanel_servers")||"[]") as {id:string;name:string}[];
 for(const c of Object.values(komari))if(c.orderId)(state.orders[c.orderId]||=[]).push({provider:"komari",serverId:c.uuid,name:nodes.find(n=>n.uuid===c.uuid)?.name||c.uuid,updatedAt:c.startedAt});
 for(const r of rows.filter(r=>r.key.startsWith("xpanel_binding:"))){const v=JSON.parse(r.value),id=v.serverId||"vps-1";(state.orders[r.key.slice(15)]||=[]).push({provider:"xpanel",serverId:id,name:servers.find(s=>s.id===id)?.name||id,updatedAt:v.updatedAt||""});}
 // Keep legacy conflicts visible until an administrator explicitly confirms a replacement.
 hydrateServiceTraffic(state,values);return state;
}
export async function updateVpsBindings(change:(state:BindingState)=>void|Promise<void>){
 const db=getRawDatabase();
 for(let attempt=0;attempt<8;attempt++){
  const row=await db.prepare('SELECT value FROM system_options WHERE "key" = ?').bind(KEY).first<{value:string}>();
  const state:BindingState=row?JSON.parse(row.value):await getVpsBindingState();
  hydrateServiceTraffic(state,await trafficOptions());
  await change(state);const value=JSON.stringify(state);if(value===row?.value)return;
  if(row){const result=await db.prepare('UPDATE system_options SET value = ?, updated_at = ? WHERE "key" = ? AND value = ?').bind(value,Math.floor(Date.now()/1000),KEY,row.value).run();if(result.meta.changes)return;}
  else{try{await db.prepare('INSERT INTO system_options ("key",value,updated_at) VALUES (?,?,?)').bind(KEY,value,Math.floor(Date.now()/1000)).run();return;}catch(error){if(attempt===7)throw error;}}
 }
 throw new Error("其他管理员正在修改绑定，请刷新后重试");
}
export async function validateVpsOrder(orderId:string){
 const [order]=await getDb().select().from(orders).where(eq(orders.id,orderId)).limit(1);
 if(!order||!isBindableNodeOrder(order))throw new Error("请选择已付款的实际节点服务订单，续费或合并账单不能绑定 VPS");
}
export async function orderVpsTargets(orderId:string):Promise<VpsTarget[]>{return (await getVpsBindingState()).orders[orderId]||[];}

async function trafficOptions(){return new Map((await getDb().select().from(systemOptions)).map(row=>[row.key,row.value]));}
// Refresh outside the compare-and-swap transaction; a failed target sync establishes a pending baseline.
export async function prepareServiceBinding(orderId:string,target:VpsTarget|null,confirmation?:string){
 const state=await getVpsBindingState(),current=state.orders[orderId]||[];
 replaceOrderBinding({...state,orders:{...state.orders}},orderId,target,confirmation);
 if(current.length===1&&target&&current[0].provider===target.provider&&current[0].serverId===target.serverId)return true;
 const targets=[...current,...(target?[target]:[])],providers=new Set(targets.map(t=>t.provider));
 let targetReady=true;
 if(providers.has("komari"))try{await (await import("./komari")).syncKomari();}catch{if(target?.provider==="komari")targetReady=false;}
 for(const id of new Set(targets.filter(t=>t.provider==="xpanel").map(t=>t.serverId)))try{await (await import("./xpanel")).syncXPanelServer(id);}catch{if(target?.provider==="xpanel"&&target.serverId===id)targetReady=false;}
 return targetReady;
}
export async function replaceServiceBinding(state:BindingState,orderId:string,target:VpsTarget|null,confirmation?:string,targetReady=true){
 const old=state.orders[orderId]||[];const values=await trafficOptions();hydrateServiceTraffic(state,values);
 replaceOrderBinding(state,orderId,target,confirmation);
 if(old.length===1&&target&&old[0].provider===target.provider&&old[0].serverId===target.serverId)return;
 const now=new Date().toISOString();let service=state.services![orderId];
 if(!service){service=createServiceTraffic(target?{...legacyTraffic(state,target,values),...(!old.some(t=>t.provider===target.provider&&t.serverId===target.serverId)?{used:0,up:0,down:0}:{})}:{total:0},null,now);state.services![orderId]=service;}
 const oldTarget=old.find(t=>service.source?.provider===t.provider&&service.source?.serverId===t.serverId);
 const snapshot=serviceTrafficSnapshot(target||undefined,values);
 switchServiceTraffic(service,serviceTrafficSnapshot(oldTarget,values),snapshot&&!targetReady?{...snapshot,online:false}:snapshot,now);
}
export async function syncServiceTraffic(){
 const orderRows=await getDb().select({id:orders.id,expiresAt:orders.expiresAt}).from(orders),byId=new Map(orderRows.map(o=>[o.id,o]));
 await updateVpsBindings(async state=>{const values=await trafficOptions();for(const [id,targets]of Object.entries(state.orders)){if(targets.length!==1)continue;const service=state.services?.[id];if(!service)continue;const snapshot=serviceTrafficSnapshot(targets[0],values);sampleServiceTraffic(service,snapshot);const order=byId.get(id);if(order?.expiresAt)advanceServiceTrafficCycle(service,{orderId:id,expiresAt:order.expiresAt.toISOString()},snapshot,Date.now());}});
}
export async function configureServiceTraffic(orderId:string,input:{total?:number;direction?:TrafficDirection;deferOfflineReset?:boolean;used?:number;requestId?:string;requireOnline?:boolean;expectedTarget?:{provider:string;serverId:string}}){
 if(input.total!==undefined&&(!Number.isFinite(input.total)||input.total<0)||input.used!==undefined&&(!Number.isFinite(input.used)||input.used<0)||input.direction&&!['sum','up','down'].includes(input.direction))throw Error("套餐额度或流量参数无效");
 await updateVpsBindings(async state=>{
  if(input.requestId&&state.resetRequests?.[input.requestId])return;
  const targets=state.orders[orderId]||[];if(targets.length>1)throw Error("请先处理旧版重复 VPS 绑定");
  if(input.expectedTarget&&(targets[0]?.provider!==input.expectedTarget.provider||targets[0]?.serverId!==input.expectedTarget.serverId))throw Error("订单绑定已改变，请刷新后重试");
  const snapshot=serviceTrafficSnapshot(targets[0],await trafficOptions());
  if(input.requireOnline&&!freshTrafficSnapshot(snapshot,Date.now()))throw Error("请先恢复 VPS 同步并获取最新数据，再重置流量");
  const service=(state.services||={})[orderId]||=createServiceTraffic({total:0},snapshot,new Date().toISOString());
  sampleServiceTraffic(service,snapshot);
  if(input.total!==undefined)service.total=input.total;if(input.direction)service.direction=input.direction;if(input.deferOfflineReset!==undefined)service.deferOfflineReset=input.deferOfflineReset;
  if(input.used!==undefined)resetServiceTrafficState(service,snapshot,input.used,new Date().toISOString());
  if(input.requestId)(state.resetRequests||={})[input.requestId]=orderId;
 });
 return (await getVpsBindingState()).services?.[orderId]||null;
}
