import {asc,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {creditAccounts,creditBills,wallets,walletTransactions} from "../../../db/schema";
import {getCurrentCustomer} from "../../../lib/auth";
import {getCreditSummary,refreshCreditRisk} from "../../../lib/credit";
import {withRequestLock} from "../../../lib/request-lock";
import {nextBusinessId} from "../../../lib/business-id";

export async function GET(){const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});const summary=await refreshCreditRisk(user.id);return NextResponse.json(summary)}

export async function POST(req:Request){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const body=await req.json().catch(()=>null),requested=Number(body?.amount);
  if(!Number.isFinite(requested)||requested<=0)return NextResponse.json({error:"请输入有效还款金额"},{status:400});
  return withRequestLock(`wallet:${user.id}`,async()=>{
    const db=getDb(),summary=await getCreditSummary(user.id),[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,user.id)).limit(1),amount=Math.min(Number(requested.toFixed(2)),summary.creditUsed);
    if(!wallet||wallet.balance<amount)return NextResponse.json({error:"账户余额不足，请先充值余额"},{status:409});
    if(amount<=0)return NextResponse.json({error:"当前没有待还信用账单"},{status:409});
    let remaining=amount;const now=new Date();
    for(const bill of summary.openBills){if(remaining<=0)break;const outstanding=Math.max(0,bill.amount-bill.repaidAmount),applied=Math.min(outstanding,remaining),repaidAmount=Number((bill.repaidAmount+applied).toFixed(2));remaining=Number((remaining-applied).toFixed(2));await db.update(creditBills).set({repaidAmount,status:repaidAmount>=bill.amount?"paid":"partial",updatedAt:now}).where(eq(creditBills.id,bill.id))}
    const nextBalance=Number((wallet.balance-amount).toFixed(2));await db.update(wallets).set({balance:nextBalance,updatedAt:now}).where(eq(wallets.customerId,user.id));await db.insert(walletTransactions).values({id:await nextBusinessId("TX",now),customerId:user.id,type:"credit_repayment",amount:-amount,balanceAfter:nextBalance,referenceType:"credit",referenceId:null,note:"信用账单还款",createdAt:now});
    const after=await getCreditSummary(user.id);if(after.creditUsed<=0)await db.update(creditAccounts).set({status:"active",updatedAt:now}).where(eq(creditAccounts.customerId,user.id));
    return NextResponse.json({ok:true,repaid:amount,balance:nextBalance,creditUsed:after.creditUsed,availableCredit:after.availableCredit});
  });
}
