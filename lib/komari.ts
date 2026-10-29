import type {KomariNodeConfig} from "./vps-binding-state";
import {eq,like} from "drizzle-orm";
import {getDb,getRawDatabase} from "../db";
import {systemOptions,orders} from "../db/schema";
import {setSystemOption} from "./db-upsert";
import {encryptCredential,decryptCredential} from "./inventory-crypto";
import {accumulate,type Meter,type Sample} from "./komari-meter";
import {getVpsBindingState,updateVpsBindings,validateVpsOrder,prepareServiceBinding,replaceServiceBinding,syncServiceTraffic,configureServiceTraffic} from "./vps-bindings";
import {isBindableNodeOrder} from "./vps-binding-state";
type Config={baseUrl:string;encryptedKey?:string;enabled:boolean};
export type NodeConfig=KomariNodeConfig;
type Node={uuid:string;name:string;group?:string;traffic_limit?:number};
async function read<T>(key:string):Promise<T|null>{const [row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,key)).limit(1);return row?JSON.parse(row.value):null}
export async function komariConfig(){return await read<Config>("komari_config")}
export async function saveKomariConfig(baseUrl:string,apiKey:string,enabled:boolean){const url=new URL(baseUrl);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("请使用不带账号、查询参数的 HTTPS 面板地址");const old=await komariConfig();if(old&&old.baseUrl!==url.href.replace(/\/$/,""))throw new Error("已有连接不能直接切换面板，以免混用流量账本");await setSystemOption("komari_config",JSON.stringify({baseUrl:url.href.replace(/\/$/,""),enabled,encryptedKey:apiKey?await encryptCredential(apiKey):old?.encryptedKey}));}
async function rpc<T>(method:string):Promise<T>{const config=await komariConfig();if(!config?.enabled)throw new Error("请先保存并启用 Komari 连接");const key=config.encryptedKey?await decryptCredential(config.encryptedKey):null;const response=await fetch(`${config.baseUrl}/api/rpc2`,{method:"POST",redirect:"manual",signal:AbortSignal.timeout(15000),headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},body:JSON.stringify({jsonrpc:"2.0",method,id:1})});if(response.status>=300&&response.status<400)throw new Error("Komari 地址发生重定向，请填写最终 HTTPS 面板地址");if(!response.ok)throw new Error(`Komari 连接失败（${response.status}）`);const data=await response.json();if(data.error)throw new Error("Komari 接口不可用，请检查版本与访问权限");return data.result as T}
async function storeSample(uuid:string,sample:Sample){const key=`komari_meter:${uuid}`,db=getRawDatabase();for(let attempt=0;attempt<6;attempt++){const old=await db.prepare('SELECT value FROM system_options WHERE "key" = ?').bind(key).first<{value:string}>();const next=JSON.stringify(accumulate(old?JSON.parse(old.value):undefined,sample));if(old?.value===next)return; if(old){const result=await db.prepare('UPDATE system_options SET value = ?, updated_at = ? WHERE "key" = ? AND value = ?').bind(next,Math.floor(Date.now()/1000),key,old.value).run();if(result.meta.changes)return;}else{try{await db.prepare('INSERT INTO system_options ("key",value,updated_at) VALUES (?,?,?)').bind(key,next,Math.floor(Date.now()/1000)).run();return;}catch(error){if(attempt===5)throw error;}}}throw new Error("流量账本正在更新，请稍后重试");}
export async function syncKomari(){const config=await komariConfig();if(!config?.enabled){await syncServiceTraffic();return{synced:0};}let nodes:Record<string,Node>,statuses:Record<string,Sample>;try{[nodes,statuses]=await Promise.all([rpc<Record<string,Node>>("common:getNodes"),rpc<Record<string,Sample>>("common:getNodesLatestStatus")]);}catch(error){await syncServiceTraffic();throw error;}for(const [uuid,sample] of Object.entries(statuses)){if(!/^[a-zA-Z0-9-]{1,80}$/.test(uuid))continue;await storeSample(uuid,sample)}await syncServiceTraffic();await setSystemOption("komari_nodes",JSON.stringify(Object.values(nodes).map(n=>({uuid:n.uuid,name:n.name,group:String(n.group||""),traffic_limit:n.traffic_limit||0}))));await setSystemOption("komari_synced_at",JSON.stringify(new Date().toISOString()));return{synced:Object.keys(statuses).length};}
export async function komariOverview(){const config=await komariConfig(),nodes=await read<Node[]>("komari_nodes")||[];if(config?.enabled&&nodes.some(n=>n.group===undefined)){const remote=await rpc<Record<string,Node>>("common:getNodes");for(const node of nodes){const fresh=remote[node.uuid];if(fresh)node.group=String(fresh.group||"");}await setSystemOption("komari_nodes",JSON.stringify(nodes));}const bindings=await bindingMap(),state=await getVpsBindingState();const orderRows=await getDb().select({id:orders.id,product:orders.product,email:orders.customerEmail,status:orders.status,adminNote:orders.adminNote}).from(orders);const rows=await getDb().select().from(systemOptions).where(like(systemOptions.key,"komari_%"));const values=new Map(rows.map(row=>[row.key,JSON.parse(row.value)]));return{orders:orderRows.filter(isBindableNodeOrder),config:{baseUrl:config?.baseUrl||"https://komari.fanke.xyz",enabled:config?.enabled||false,keyConfigured:Boolean(config?.encryptedKey)},syncedAt:values.get("komari_synced_at")||null,nodes:nodes.map(node=>({...node,meter:values.get(`komari_meter:${node.uuid}`)||null,binding:bindings[node.uuid]||null,traffic:state.services?.[bindings[node.uuid]?.orderId]||null}))};}
async function bindingMap():Promise<Record<string,NodeConfig>>{
 const state=await getVpsBindingState();
 return Object.fromEntries(Object.entries(state.komari).map(([id,c])=>[id,{...c,orderId:Object.entries(state.orders).find(([,targets])=>targets.some(t=>t.provider==="komari"&&t.serverId===id))?.[0]||""}]));
}
export async function configureKomariNode(input:{uuid:string;orderId:string;total?:number;direction?:string;adjustment?:number;confirmation?:string;deferOfflineReset?:boolean}){
 const nodes=await read<Node[]>("komari_nodes")||[];
 if(!nodes.some(n=>n.uuid===input.uuid))throw new Error("请先同步并选择有效节点");
 if(input.total!==undefined&&(!Number.isFinite(input.total)||input.total<0)||input.direction!==undefined&&!["sum","up","down"].includes(input.direction))throw new Error("流量额度或方向无效");
 if(input.adjustment!=null&&(!Number.isFinite(input.adjustment)||input.adjustment<0))throw new Error("校准值无效");
 if(input.orderId)await validateVpsOrder(input.orderId);
 const previous=await getVpsBindingState(),previousOwner=Object.entries(previous.orders).find(([,targets])=>targets.some(t=>t.provider==="komari"&&t.serverId===input.uuid))?.[0];
 const target=input.orderId?{provider:"komari" as const,serverId:input.uuid,name:nodes.find(n=>n.uuid===input.uuid)!.name,updatedAt:new Date().toISOString()}:null;
 const targetReady=input.orderId||previousOwner?await prepareServiceBinding(input.orderId||previousOwner!,target,input.confirmation):true;
 await updateVpsBindings(async state=>{
  const owner=Object.entries(state.orders).find(([,targets])=>targets.some(t=>t.provider==="komari"&&t.serverId===input.uuid))?.[0];
  if(owner&&input.orderId&&owner!==input.orderId)throw new Error("该 VPS 已绑定其他订单，请先解除原订单绑定");
  const existed=Boolean(state.services?.[input.orderId]);
  if(input.orderId)await replaceServiceBinding(state,input.orderId,{provider:"komari",serverId:input.uuid,name:nodes.find(n=>n.uuid===input.uuid)!.name,updatedAt:new Date().toISOString()},input.confirmation,targetReady);
  else if(owner)await replaceServiceBinding(state,owner,null,input.confirmation);
  const old=state.komari[input.uuid],meter=await read<Meter>(`komari_meter:${input.uuid}`),reset=!old;
  state.komari[input.uuid]={...old,deferOfflineReset:old?.deferOfflineReset??true,uuid:input.uuid,orderId:input.orderId,total:old?.total??nodes.find(n=>n.uuid===input.uuid)?.traffic_limit??0,direction:old?.direction||"sum",baselineUp:reset?meter?.up||0:old.baselineUp,baselineDown:reset?meter?.down||0:old.baselineDown,adjustment:reset?0:old.adjustment,startedAt:reset?new Date().toISOString():old.startedAt};
  // Legacy callers may edit a service, but a target VPS must never overwrite a carried package.
  const service=state.services?.[input.orderId];
  if(service&&(owner===input.orderId||!existed)){
   if(input.total!==undefined)service.total=input.total;
   if(input.direction!==undefined)service.direction=input.direction as NodeConfig["direction"];
   if(input.deferOfflineReset!==undefined)service.deferOfflineReset=input.deferOfflineReset;
  }
 });
 if(input.orderId&&input.adjustment!==undefined)await configureServiceTraffic(input.orderId,{used:input.adjustment,expectedTarget:{provider:"komari",serverId:input.uuid}});
}
export async function bindKomariOrder(orderId:string,uuid:string,confirmation?:string){
 if(!orderId)throw new Error("缺少订单编号");
 const map=await bindingMap(),current=Object.values(map).find(n=>n.orderId===orderId);
 if(!uuid&&!current)throw new Error("此订单尚未绑定 VPS");
 await configureKomariNode({uuid:uuid||current!.uuid,orderId:uuid?orderId:"",confirmation});
}
let latestRequest:Promise<Record<string,Sample>>|null=null;
export async function resetKomariOrderTraffic(orderId:string,uuid:string,requestId:string){
 if((await getVpsBindingState()).resetRequests?.[requestId])return;
 const sample=(await rpc<Record<string,Sample>>("common:getNodesLatestStatus"))[uuid];
 if(!sample||sample.online===false||!Number.isFinite(Date.parse(sample.time))||Date.now()-Date.parse(sample.time)>180000)throw new Error("探针离线或数据未更新，请恢复采样后再重置");
 await storeSample(uuid,sample);
 await configureServiceTraffic(orderId,{used:0,requestId,requireOnline:true,expectedTarget:{provider:"komari",serverId:uuid}});
}
let latestRequestedAt=0;
async function customerLatestStatus(){
 // Share concurrent refreshes and briefly cache the remote response within this worker.
 if(!latestRequest||Date.now()-latestRequestedAt>15000){latestRequestedAt=Date.now();latestRequest=rpc<Record<string,Sample>>("common:getNodesLatestStatus");}
 return latestRequest;
}
export async function komariOrderTraffic(orderId:string,refresh=false){
 const overview=await komariOverview(),node=overview.nodes.find(n=>n.binding?.orderId===orderId);if(!node)return null;
 let refreshFailed=false;
 if(refresh&&overview.config.enabled){try{const sample=(await customerLatestStatus())[node.uuid];if(!sample)throw new Error("暂无探针数据");await storeSample(node.uuid,sample);await syncServiceTraffic();}catch{refreshFailed=true;}}
 await syncServiceTraffic();
 const service=(await getVpsBindingState()).services?.[orderId],meter=await read<Meter>(`komari_meter:${node.uuid}`);
 if(!service)return null;
 return{source:"komari",used:service.used,total:service.total,remaining:Math.max(0,service.total-service.used),up:service.up,down:service.down,pendingBaseline:!service.source?.sampledAt,syncedAt:meter?.last?.time||null,online:overview.config.enabled&&meter?.last?.online===true,refreshFailed,stale:!overview.config.enabled||!meter?.last||Date.now()-Date.parse(meter.last.time)>180000};
}
