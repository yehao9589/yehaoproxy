import test from "node:test";
import assert from "node:assert/strict";
import {advanceTrafficCycle,scheduledTrafficResetAt} from "../lib/traffic-cycle.ts";
const first="2026-10-15T00:00:00Z",next="2026-11-15T00:00:00Z";
const original={boundOrderId:"o",boundOrderExpiry:first};
test("early renewal preserves original boundary",()=>{assert.equal(advanceTrafficCycle(original,{orderId:"o",expiresAt:next},Date.parse(first)-1).reset,false);const r=advanceTrafficCycle(original,{orderId:"o",expiresAt:next},Date.parse(first));assert.equal(r.reset,true);assert.equal(r.boundOrderExpiry,next)});
test("same boundary is reset once",()=>{const r=advanceTrafficCycle(original,{orderId:"o",expiresAt:first},Date.parse(first));assert.equal(r.reset,true);assert.equal(advanceTrafficCycle(r,{orderId:"o",expiresAt:first},Date.parse(first)+1).reset,false)});
test("late renewal resumes next expiry",()=>{const r=advanceTrafficCycle(original,{orderId:"o",expiresAt:first},Date.parse(first));const renewed=advanceTrafficCycle(r,{orderId:"o",expiresAt:next},Date.parse(first)+1000);assert.equal(renewed.reset,false);assert.equal(renewed.boundOrderExpiry,next);assert.equal(advanceTrafficCycle(renewed,{orderId:"o",expiresAt:next},Date.parse(next)).reset,true)});
test("manual reset timestamp cannot shift service boundary",()=>{assert.equal(advanceTrafficCycle({...original,startedAt:"2026-10-14T00:00:00Z"},{orderId:"o",expiresAt:next},Date.parse(first)).reset,true)});
test("changing owner discards previous owner boundary",()=>{assert.equal(advanceTrafficCycle(original,{orderId:"new",expiresAt:next},Date.parse(first)).reset,false)});

test("next reset reflects the service ledger, not a renewed expiry or a manual reset",()=>{
 const ledger={...original,startedAt:"2026-10-14T00:00:00Z"},order={orderId:"o",expiresAt:next};
 assert.equal(scheduledTrafficResetAt(ledger,order),new Date(first).toISOString());
 assert.deepEqual(ledger,{...original,startedAt:"2026-10-14T00:00:00Z"});
 const advanced=advanceTrafficCycle(ledger,order,Date.parse(first));
 assert.equal(scheduledTrafficResetAt(advanced,order),new Date(next).toISOString());
});

test("reset display retains a pending boundary, omits a processed one and handles no schedule",()=>{
 const order={orderId:"o",expiresAt:first};
 assert.equal(scheduledTrafficResetAt(original,order),new Date(first).toISOString());
 const processed=advanceTrafficCycle(original,order,Date.parse(first));
 assert.equal(scheduledTrafficResetAt(processed,order),null);
 assert.equal(scheduledTrafficResetAt(processed,{...order,expiresAt:next}),new Date(next).toISOString());
 assert.equal(scheduledTrafficResetAt(original,{...order,expiresAt:null}),null);
 assert.equal(scheduledTrafficResetAt(original,{...order,expiresAt:"invalid"}),null);
 assert.equal(scheduledTrafficResetAt(original,{orderId:"other",expiresAt:next}),new Date(next).toISOString());
});
