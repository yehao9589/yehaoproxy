import {advanceTrafficCycle,type TrafficCycle} from "./traffic-cycle.ts";
export type TrafficDirection="sum"|"up"|"down";
export type TrafficSnapshot={provider:"komari"|"xpanel";serverId:string;up:number;down:number;sampledAt:string;online:boolean};
export type ServiceTraffic=TrafficCycle&{total:number;direction:TrafficDirection;used:number;up:number;down:number;startedAt:string;deferOfflineReset:boolean;source:TrafficSnapshot|null;history:{from:string|null;to:string|null;used:number;at:string}[]};
const finite=(v:number)=>Number.isFinite(v)&&v>=0?v:0;
const name=(s:TrafficSnapshot|null)=>s?`${s.provider}:${s.serverId}`:null;
export function freshTrafficSnapshot(s:TrafficSnapshot|null|undefined,now:number){return !!s&&s.online&&Number.isFinite(s.up)&&s.up>=0&&Number.isFinite(s.down)&&s.down>=0&&Number.isFinite(Date.parse(s.sampledAt))&&Math.abs(now-Date.parse(s.sampledAt))<=180000}
export function createServiceTraffic(input:{total:number;direction?:TrafficDirection;used?:number;up?:number;down?:number;startedAt?:string;deferOfflineReset?:boolean}&TrafficCycle,snapshot:TrafficSnapshot|null,now:string):ServiceTraffic{
 return {boundOrderId:input.boundOrderId,boundOrderExpiry:input.boundOrderExpiry,lastOrderExpiryReset:input.lastOrderExpiryReset,total:finite(input.total),direction:input.direction||"sum",used:finite(input.used||0),up:finite(input.up||0),down:finite(input.down||0),startedAt:input.startedAt||now,deferOfflineReset:input.deferOfflineReset!==false,source:snapshot?{...snapshot}:null,history:[]};
}
export function sampleServiceTraffic(service:ServiceTraffic,snapshot:TrafficSnapshot|null){
 if(!snapshot||!snapshot.online||!Number.isFinite(snapshot.up)||snapshot.up<0||!Number.isFinite(snapshot.down)||snapshot.down<0||!Number.isFinite(Date.parse(snapshot.sampledAt)))return;
 const old=service.source;if(!old||name(old)!==name(snapshot))return;
 if(!old.sampledAt){service.source={...snapshot};return;}
 if(Date.parse(snapshot.sampledAt)<=Date.parse(old.sampledAt))return;
 const up=snapshot.up>=old.up?snapshot.up-old.up:snapshot.up,down=snapshot.down>=old.down?snapshot.down-old.down:snapshot.down;
 service.up+=finite(up);service.down+=finite(down);service.used+=finite(service.direction==="up"?up:service.direction==="down"?down:up+down);service.source={...snapshot};
}
export function switchServiceTraffic(service:ServiceTraffic,oldSnapshot:TrafficSnapshot|null,target:TrafficSnapshot|null,now:string){
 if(name(service.source)===name(target)&&target)return;
 sampleServiceTraffic(service,oldSnapshot);
 service.history.push({from:name(service.source),to:name(target),used:service.used,at:now});
 service.source=target?{...target,...(!freshTrafficSnapshot(target,Date.parse(now))?{up:0,down:0,sampledAt:""}:{} )}:null;
}
export function resetServiceTrafficState(service:ServiceTraffic,snapshot:TrafficSnapshot|null,used:number,now:string){
 service.used=finite(used);service.up=0;service.down=0;service.startedAt=now;
 if(snapshot&&name(service.source)===name(snapshot)&&(service.source?.sampledAt||freshTrafficSnapshot(snapshot,Date.parse(now))))service.source={...snapshot};
}
export function advanceServiceTrafficCycle(service:ServiceTraffic,order:{orderId:string;expiresAt:string},snapshot:TrafficSnapshot|null,now:number){
 const online=freshTrafficSnapshot(snapshot,now);
 const cycleTime=service.deferOfflineReset?(online?Math.min(now,Date.parse(snapshot!.sampledAt)):Number.NEGATIVE_INFINITY):now;
 const {reset,...cycle}=advanceTrafficCycle(service,order,cycleTime);
 Object.assign(service,cycle);if(reset)resetServiceTrafficState(service,snapshot,0,new Date(now).toISOString());return reset;
}
