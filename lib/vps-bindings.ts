import {eq} from "drizzle-orm";
import {getDb,getRawDatabase} from "../db";
import {orders,systemOptions} from "../db/schema";
import {isBindableNodeOrder,type BindingState,type KomariNodeConfig,type VpsTarget} from "./vps-binding-state";
export {BindingSwitchRequired} from "./vps-binding-state";
const KEY="vps_bindings_v1";
export async function getVpsBindingState():Promise<BindingState>{
 const rows=await getDb().select().from(systemOptions),values=new Map(rows.map(r=>[r.key,r.value]));
 if(values.has(KEY))return JSON.parse(values.get(KEY)!);
 const komari:Record<string,KomariNodeConfig>=values.has("komari_bindings")?JSON.parse(values.get("komari_bindings")!):Object.fromEntries(rows.filter(r=>r.key.startsWith("komari_node:")).map(r=>[r.key.slice(12),JSON.parse(r.value)]));
 const state:BindingState={orders:{},komari};
 const nodes=JSON.parse(values.get("komari_nodes")||"[]") as {uuid:string;name:string}[];
 const servers=JSON.parse(values.get("xpanel_servers")||"[]") as {id:string;name:string}[];
 for(const c of Object.values(komari))if(c.orderId)(state.orders[c.orderId]||=[]).push({provider:"komari",serverId:c.uuid,name:nodes.find(n=>n.uuid===c.uuid)?.name||c.uuid,updatedAt:c.startedAt});
 for(const r of rows.filter(r=>r.key.startsWith("xpanel_binding:"))){const v=JSON.parse(r.value),id=v.serverId||"vps-1";(state.orders[r.key.slice(15)]||=[]).push({provider:"xpanel",serverId:id,name:servers.find(s=>s.id===id)?.name||id,updatedAt:v.updatedAt||""});}
 // Keep legacy conflicts visible until an administrator explicitly confirms a replacement.
 return state;
}
export async function updateVpsBindings(change:(state:BindingState)=>void|Promise<void>){
 const db=getRawDatabase();
 for(let attempt=0;attempt<8;attempt++){
  const row=await db.prepare('SELECT value FROM system_options WHERE "key" = ?').bind(KEY).first<{value:string}>();
  const state:BindingState=row?JSON.parse(row.value):await getVpsBindingState();
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
