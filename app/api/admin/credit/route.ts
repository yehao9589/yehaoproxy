import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getDb} from "../../../../db";
import {creditAccounts,creditBills,currencies,customers,wallets} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {ensureCreditSchema} from "../../../../lib/credit-schema";

export async function GET(){
 if(!await requireAdminApi("finance"))return NextResponse.json({error:"无信用账期查看权限"},{status:403});
 await ensureCreditSchema();
 const db=getDb(),[customerRows,walletRows,accountRows,billRows,defaultCurrencies]=await Promise.all([
  db.select({id:customers.id,name:customers.name,email:customers.email}).from(customers).where(eq(customers.role,"customer")),
  db.select().from(wallets),db.select().from(creditAccounts),db.select().from(creditBills),db.select().from(currencies).where(eq(currencies.isDefault,true)).limit(1),
 ]),systemCurrency=defaultCurrencies[0]?.code||"CNY",customerMap=new Map(customerRows.map(row=>[row.id,row])),accountMap=new Map(accountRows.map(row=>[row.customerId,row])),billsByCustomer=new Map<string,typeof billRows>();
 for(const bill of billRows){const list=billsByCustomer.get(bill.customerId)||[];list.push(bill);billsByCustomer.set(bill.customerId,list)}
 const now=Date.now(),customerIds=new Set([...walletRows.filter(row=>row.creditLimit>0).map(row=>row.customerId),...billRows.map(row=>row.customerId)]),items=[...customerIds].map(customerId=>{
  const customer=customerMap.get(customerId),wallet=walletRows.find(row=>row.customerId===customerId),account=accountMap.get(customerId),bills=(billsByCustomer.get(customerId)||[]).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()),openBills=bills.filter(row=>row.status!=="paid"),outstanding=openBills.reduce((sum,row)=>sum+Math.max(0,row.amount-row.repaidAmount),0),overdueAmount=openBills.filter(row=>row.status==="overdue"||row.dueAt.getTime()<=now).reduce((sum,row)=>sum+Math.max(0,row.amount-row.repaidAmount),0),nextDueAt=openBills.map(row=>row.dueAt).sort((a,b)=>a.getTime()-b.getTime())[0]||null,status=account?.status==="frozen"?"frozen":overdueAmount>0?"overdue":outstanding>0?"unpaid":"active";
  return{customerId,customerName:customer?.name||"未设置名称",customerEmail:customer?.email||"客户不存在",creditLimit:Number(wallet?.creditLimit||0),creditUsed:Number(outstanding.toFixed(2)),availableCredit:Number(Math.max(0,Number(wallet?.creditLimit||0)-outstanding).toFixed(2)),outstanding:Number(outstanding.toFixed(2)),overdueAmount:Number(overdueAmount.toFixed(2)),currency:systemCurrency,billDay:account?.billDay||1,repaymentDay:account?.repaymentDay||10,graceDays:account?.graceDays||2,status,nextDueAt,bills:bills.map(row=>({...row,outstanding:Number(Math.max(0,row.amount-row.repaidAmount).toFixed(2))}))};
 }).sort((a,b)=>b.overdueAmount-a.overdueAmount||b.outstanding-a.outstanding);
 return NextResponse.json({items,summary:{customers:items.length,totalLimit:Number(items.reduce((sum,row)=>sum+row.creditLimit,0).toFixed(2)),used:Number(items.reduce((sum,row)=>sum+row.creditUsed,0).toFixed(2)),outstanding:Number(items.reduce((sum,row)=>sum+row.outstanding,0).toFixed(2)),overdue:Number(items.reduce((sum,row)=>sum+row.overdueAmount,0).toFixed(2)),overdueCustomers:items.filter(row=>row.overdueAmount>0).length,frozenCustomers:items.filter(row=>row.status==="frozen").length}});
}
