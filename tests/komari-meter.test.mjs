import {test} from "node:test";
import assert from "node:assert/strict";
import {accumulate} from "../lib/komari-meter.ts";
const sample=(second,up,down,uptime=second+100)=>({time:new Date(Date.UTC(2026,8,8,0,0,second)).toISOString(),net_total_up:up,net_total_down:down,uptime});
test("first sample is a baseline and duplicates do not add traffic",()=>{const first=accumulate(undefined,sample(0,100,200));assert.equal(first.up,0);const next=accumulate(first,sample(60,120,230));assert.equal(next.up,20);assert.equal(next.down,30);assert.deepEqual(accumulate(next,sample(60,120,230)),next);assert.deepEqual(accumulate(next,sample(30,500,500)),next)});
test("reboot preserves prior usage and adds new counters independently",()=>{let meter=accumulate(undefined,sample(0,100,200));meter=accumulate(meter,sample(60,140,250));meter=accumulate(meter,sample(120,5,8,10));assert.equal(meter.up,45);assert.equal(meter.down,58);assert.equal(meter.resets,1);const restored=JSON.parse(JSON.stringify(meter));assert.equal(accumulate(restored,sample(180,15,18,70)).up,55)});
test("counter reset without uptime reset and invalid measurements",()=>{let m=accumulate(undefined,sample(0,100,200));m=accumulate(m,sample(60,4,220));assert.equal(m.up,4);assert.equal(m.down,20);assert.throws(()=>accumulate(m,sample(120,-1,300)));assert.throws(()=>accumulate(m,{...sample(120,1,2),time:"bad"}))});
