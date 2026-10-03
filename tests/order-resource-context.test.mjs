import test from "node:test";
import assert from "node:assert/strict";
import {resourcesForOrder} from "../lib/order-resource-context.ts";
const allocations=[{id:"a",orderId:"source"},{id:"b",orderId:"source"},{id:"c",orderId:"source"}];
const source={id:"source"};
test("single renewal selects only its allocation, not all source IPs",()=>{
 const renewal={id:"r",adminNote:"[RENEWAL_OF]source\n[RENEW_ALLOCATION]b"};
 assert.deepEqual(resourcesForOrder(renewal,[source,renewal],allocations).map(a=>a.id),["b"]);
});
test("bundle resolves child renewal allocations and excludes other source resources",()=>{
 const bundle={id:"bundle"},a={id:"r1",adminNote:"[BUNDLE_PARENT]bundle\n[RENEWAL_OF]source\n[RENEW_ALLOCATION]a"},b={id:"r2",adminNote:"[BUNDLE_PARENT]bundle\n[RENEWAL_OF]source\n[RENEW_ALLOCATION]b"};
 assert.deepEqual(resourcesForOrder(bundle,[source,bundle,a,b],allocations).map(a=>a.id),["a","b"]);
});
test("missing explicit allocation never falls back to unrelated IPs",()=>{
 assert.deepEqual(resourcesForOrder({id:"r",adminNote:"[RENEWAL_OF]source\n[RENEW_ALLOCATION]missing"},[source],allocations),[]);
 assert.deepEqual(resourcesForOrder({id:"r",adminNote:"[RENEWAL_OF]another\n[RENEW_ALLOCATION]a"},[source],allocations),[]);
});
