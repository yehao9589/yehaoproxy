import test from "node:test";
import assert from "node:assert/strict";
import {createServiceTraffic,sampleServiceTraffic,switchServiceTraffic,resetServiceTrafficState,advanceServiceTrafficCycle} from "../lib/service-traffic-state.ts";
import {hydrateServiceTraffic} from "../lib/service-traffic-migration.ts";
const GB=1e9,now="2026-10-29T00:00:00.000Z",at=(seconds)=>new Date(Date.parse(now)+seconds*1000).toISOString();
const sample=(provider="komari",serverId="a",up=100,down=200,seconds=0,online=true)=>({provider,serverId,up:up*GB,down:down*GB,sampledAt:at(seconds),online});
const service=()=>createServiceTraffic({total:100*GB,used:30*GB,boundOrderId:"order",boundOrderExpiry:at(3600)},sample(),now);
for(const provider of ["komari","xpanel"])test(`same-provider ${provider} replacement carries quota, usage and cycle`,()=>{
 const s=createServiceTraffic({total:100*GB,used:30*GB,boundOrderId:"order",boundOrderExpiry:at(3600)},sample(provider),now);
 switchServiceTraffic(s,sample(provider,"a",102,203,10),sample(provider,"b",900,1800,10),at(10));
 assert.equal(s.total,100*GB);assert.equal(s.used,35*GB);assert.equal(s.boundOrderExpiry,at(3600));
 sampleServiceTraffic(s,sample(provider,"b",901,1802,20));assert.equal(s.used,38*GB);
 assert.equal(s.history[0].used,35*GB);
});
test("cross-panel replacements never import the target server's previous traffic",()=>{
 const s=service();switchServiceTraffic(s,sample("komari","a",101,201,10),sample("xpanel","b",900,1800,10),at(10));
 assert.equal(s.used,32*GB);sampleServiceTraffic(s,sample("xpanel","b",903,1802,20));assert.equal(s.used,37*GB);
 switchServiceTraffic(s,sample("xpanel","b",904,1802,30),sample("komari","a",800,1000,30),at(30));
 sampleServiceTraffic(s,sample("komari","a",802,1001,40));assert.equal(s.used,41*GB);assert.equal(s.total,100*GB);
});
test("duplicate saves and out-of-order samples do not add traffic twice",()=>{
 const s=service();sampleServiceTraffic(s,sample("komari","a",101,202,10));
 const before=structuredClone(s);sampleServiceTraffic(s,sample("komari","a",102,203,5));
 sampleServiceTraffic(s,sample("komari","a",101,202,10));switchServiceTraffic(s,null,sample("komari","a",101,202,10),at(10));
 assert.deepEqual(s,before);
});
test("unbind and later rebind keep the service ledger",()=>{
 const s=service();switchServiceTraffic(s,sample("komari","a",102,203,10),null,at(10));
 assert.equal(s.used,35*GB);assert.equal(s.source,null);
 switchServiceTraffic(s,null,sample("xpanel","b",900,1800,20),at(20));
 assert.equal(s.used,35*GB);sampleServiceTraffic(s,sample("xpanel","b",901,1800,30));assert.equal(s.used,36*GB);
});
test("offline replacement waits for its first valid sample instead of billing old traffic",()=>{
 const s=service();switchServiceTraffic(s,null,sample("xpanel","b",900,1800,-600,false),at(10));
 assert.equal(s.source.sampledAt,"");assert.equal(s.used,30*GB);
 sampleServiceTraffic(s,sample("xpanel","b",1000,2000,20));assert.equal(s.used,30*GB);
 sampleServiceTraffic(s,sample("xpanel","b",1001,2003,30));assert.equal(s.used,34*GB);
});
test("manual calibration during a pending baseline cannot bill the target's old counters",()=>{
 const s=service(),offline=sample("xpanel","b",900,1800,-600,false);
 switchServiceTraffic(s,null,offline,at(10));resetServiceTrafficState(s,offline,5*GB,at(11));
 assert.equal(s.source.sampledAt,"");sampleServiceTraffic(s,sample("xpanel","b",1000,2000,20));assert.equal(s.used,5*GB);
});
test("a reset preserves the service boundary and target raw counters",()=>{
 const s=service(),fresh=sample("komari","a",101,202,10),raw=structuredClone(fresh);
 resetServiceTrafficState(s,fresh,0,at(10));assert.deepEqual(fresh,raw);assert.equal(s.boundOrderExpiry,at(3600));
 sampleServiceTraffic(s,sample("komari","a",102,204,20));assert.equal(s.used,3*GB);
});
for(const [direction,expected] of [["up",2],["down",3],["sum",5]])test(`counting direction ${direction} is applied to new increments only`,()=>{
 const s=service();s.direction=direction;sampleServiceTraffic(s,sample("komari","a",102,203,10));assert.equal(s.used,(30+expected)*GB);
});
test("a restarted raw counter continues without negative usage",()=>{
 const s=service();sampleServiceTraffic(s,sample("xpanel","wrong",1,2,10));assert.equal(s.used,30*GB);
 sampleServiceTraffic(s,sample("komari","a",1,2,10));assert.equal(s.used,33*GB);
});
for(const defer of [true,false])test(`offline cycle policy defer=${defer} remains attached to the service`,()=>{
 const s=service();s.deferOfflineReset=defer;const order={orderId:"order",expiresAt:at(7200)},offline=sample("komari","a",100,200,0,false);
 assert.equal(advanceServiceTrafficCycle(s,order,offline,Date.parse(at(3601))),!defer);
 assert.equal(s.used,(defer?30:0)*GB);
 const fresh=sample("komari","a",101,202,3610);sampleServiceTraffic(s,fresh);
 assert.equal(advanceServiceTrafficCycle(s,order,fresh,Date.parse(at(3610))),defer);
 assert.equal(s.used,(defer?0:3)*GB);assert.equal(s.boundOrderExpiry,at(7200));
 assert.equal(advanceServiceTrafficCycle(s,order,fresh,Date.parse(at(3620))),false);
});
test("legacy Komari quota, adjustment, direction and cycle are migrated exactly once",()=>{
 const target={provider:"komari",serverId:"a",name:"A",updatedAt:now},config={uuid:"a",orderId:"order",total:80*GB,direction:"up",baselineUp:90*GB,baselineDown:150*GB,adjustment:5*GB,startedAt:at(-3600),boundOrderId:"order",boundOrderExpiry:at(3600),deferOfflineReset:false};
 const state={orders:{order:[target]},komari:{a:config}},values=new Map([["komari_config",JSON.stringify({enabled:true})],["komari_meter:a",JSON.stringify({up:100*GB,down:200*GB,last:{time:now,online:true}})]]);
 hydrateServiceTraffic(state,values);const s=state.services.order;
 assert.equal(s.total,80*GB);assert.equal(s.used,15*GB);assert.equal(s.direction,"up");assert.equal(s.deferOfflineReset,false);assert.equal(s.boundOrderExpiry,at(3600));assert.deepEqual(state.komari.a,config);
 s.used=40*GB;values.set("komari_meter:a",JSON.stringify({up:999*GB,down:999*GB,last:{time:at(1),online:true}}));
 hydrateServiceTraffic(state,values);assert.equal(state.services.order.used,40*GB);
});
test("legacy X-Panel quota bytes are retained without unit conversion or raw traffic duplication",()=>{
 const state={orders:{order:[{provider:"xpanel",serverId:"b",name:"B",updatedAt:now}]},komari:{}};
 const server={id:"b",enabled:true,totalBytes:100*1073741824,lastSyncStatus:"success",lastMetrics:{up:900*GB,down:1800*GB,used:25*GB,syncedAt:now},boundOrderExpiry:at(3600),deferOfflineReset:false};
 hydrateServiceTraffic(state,new Map([["xpanel_servers",JSON.stringify([server])]]));assert.equal(state.services.order.total,server.totalBytes);assert.equal(state.services.order.used,25*GB);assert.equal(state.services.order.boundOrderExpiry,at(3600));
 sampleServiceTraffic(state.services.order,sample("xpanel","b",901,1801,10));assert.equal(state.services.order.used,27*GB);
});
test("an unconfigured or conflicting legacy binding is not guessed or charged",()=>{
 const state={orders:{empty:[],conflict:[{provider:"komari",serverId:"a"},{provider:"xpanel",serverId:"b"}]},komari:{}};
 hydrateServiceTraffic(state,new Map());assert.deepEqual(state.services,{});
});
