import {asc,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {creditAccounts,creditBills,wallets,walletTransactions} from "../../../db/schema";
import {getCurrentCustomer} from "../../../lib/auth";
import {getCreditSummary,refreshCreditRisk} from "../../../lib/credit";
import {withRequestLock} from "../../../lib/request-lock";
import {nextBusinessId} from "../../../lib/business-id";
import {audit} from "../../../lib/audit";
import {creditRepaymentPlan} from "../../../lib/credit-repayment-plan";

export async function GET(){const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});const summary=await refreshCreditRisk(user.id);return NextResponse.json(summary)}

export async function POST(req:Request){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const body=await req.json().catch(()=>null),requested=Number(body?.amount);
  if(!Number.isFinite(requested)||requested<=0)return NextResponse.json({error:"请输入有效还款金额"},{status:400});
  return withRequestLock(`wallet:${user.id}`,async()=>{
    const db=getDb(),summary=await getCreditSummary(user.id),[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,user.id)).limit(1),amount=Math.min(Number(requested.toFixed(2)),summary.creditUsed);
    if(!wallet||wallet.balance<amount)return NextResponse.json({error:"账户余额不足，请先充值余额"},{status:409});
    if(amount<=0)return NextResponse.json({error:"当前没有待还信用账单"},{status:409});
    const now=new Date(),plan=creditRepaymentPlan(summary.openBills,amount);
    const nextBalance=Number((wallet.balance-plan.repaid).toFixed(2));
    type Q=Parameters<typeof db.batch>[0][number];
    const writes:Q[]=plan.updates.map(update=>db.update(creditBills).set({repaidAmount:update.repaidAmount,status:update.status,updatedAt:now}).where(eq(creditBills.id,update.id)));
    writes.push(db.update(wallets).set({balance:nextBalance,updatedAt:now}).where(eq(wallets.customerId,user.id)));
    writes.push(db.insert(walletTransactions).values({id:await nextBusinessId("TX",now),customerId:user.id,type:"credit_repayment",amount:-plan.repaid,balanceAfter:nextBalance,referenceType:"credit",referenceId:null,note:"信用账单还款",createdAt:now}));
    await db.batch(writes as [Q,...Q[]]);
    const after=await getCreditSummary(user.id);if(after.creditUsed<=0)await db.update(creditAccounts).set({status:"active",updatedAt:now}).where(eq(creditAccounts.customerId,user.id));
    await audit({id:user.id,role:user.role},"credit.repayment","credit",user.id,{amount,balanceAfter:nextBalance,creditUsed:after.creditUsed,availableCredit:after.availableCredit},req);
    return NextResponse.json({ok:true,repaid:amount,balance:nextBalance,creditUsed:after.creditUsed,availableCredit:after.availableCredit});
  });
}
