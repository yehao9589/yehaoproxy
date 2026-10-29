import type {BindingState,VpsTarget} from "./vps-binding-state.ts";
import {createServiceTraffic,type TrafficSnapshot} from "./service-traffic-state.ts";
function optionValue(values:Map<string,string>,key:string){try{return JSON.parse(values.get(key)||"null")}catch{return null}}
export function serviceTrafficSnapshot(target:VpsTarget|undefined,values:Map<string,string>):TrafficSnapshot|null{
 if(!target)return null;
 if(target.provider==="komari"){const meter=optionValue(values,`komari_meter:${target.serverId}`),config=optionValue(values,"komari_config");return {provider:"komari",serverId:target.serverId,up:Number(meter?.up||0),down:Number(meter?.down||0),sampledAt:meter?.last?.time||"",online:config?.enabled===true&&meter?.last?.online===true};}
 const server=(optionValue(values,"xpanel_servers")||[]).find((item:{id:string})=>item.id===target.serverId),m=server?.lastMetrics;
 return {provider:"xpanel",serverId:target.serverId,up:Number(m?.up||0),down:Number(m?.down||0),sampledAt:m?.syncedAt||"",online:server?.enabled===true&&server?.lastSyncStatus==="success"};
}
export function legacyTraffic(state:BindingState,target:VpsTarget,values:Map<string,string>){
 if(target.provider==="komari"){const c=state.komari[target.serverId],s=serviceTrafficSnapshot(target,values),up=Math.max(0,(s?.up||0)-(c?.baselineUp||0)),down=Math.max(0,(s?.down||0)-(c?.baselineDown||0));return {...c,total:c?.total??(optionValue(values,"komari_nodes")||[]).find((n:{uuid:string})=>n.uuid===target.serverId)?.traffic_limit??0,used:(c?.direction==="up"?up:c?.direction==="down"?down:up+down)+(c?.adjustment||0),up,down};}
 const server=(optionValue(values,"xpanel_servers")||[]).find((item:{id:string})=>item.id===target.serverId);
 return {total:server?.totalBytes||0,direction:"sum" as const,used:server?.lastMetrics?.used||0,startedAt:server?.cycleStartedAt,deferOfflineReset:server?.deferOfflineReset,boundOrderId:server?.boundOrderId,boundOrderExpiry:server?.boundOrderExpiry,lastOrderExpiryReset:server?.lastOrderExpiryReset};
}
export function hydrateServiceTraffic(state:BindingState,values:Map<string,string>){
 state.services||={};for(const [id,targets]of Object.entries(state.orders)){if(targets.length!==1||state.services[id])continue;const target=targets[0];state.services[id]=createServiceTraffic(legacyTraffic(state,target,values),serviceTrafficSnapshot(target,values),new Date().toISOString());}
}
