import {test} from "node:test";
import assert from "node:assert/strict";
import {creditRepaymentPlan} from "../lib/credit-repayment-plan.ts";
test("repayment settles older debts then partially pays the next bill",()=>{
 assert.deepEqual(creditRepaymentPlan([{id:"a",amount:10,repaidAmount:3},{id:"b",amount:20,repaidAmount:0}],12),{updates:[{id:"a",repaidAmount:10,status:"paid"},{id:"b",repaidAmount:5,status:"partial"}],repaid:12,remainder:0});
});
test("excess payment and a repeated allocation on settled debts preserve funds",()=>{
 const bills=[{id:"a",amount:0.3,repaidAmount:0.1}];
 const first=creditRepaymentPlan(bills,1);
 assert.equal(first.repaid,0.2);assert.equal(first.remainder,0.8);
 const again=creditRepaymentPlan([{...bills[0],repaidAmount:0.3}],1);
 assert.equal(again.repaid,0);assert.equal(again.remainder,1);
});
test("invalid amounts are rejected",()=>{
 for(const amount of [NaN,Infinity,0,-1])assert.throws(()=>creditRepaymentPlan([],amount));
});
