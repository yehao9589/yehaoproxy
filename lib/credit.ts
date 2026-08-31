import {and,asc,eq,inArray} from "drizzle-orm";
import {getDb} from "../db";
import {creditAccounts,creditBills,customers,notifications,orders,proxyAllocations,wallets} from "../db/schema";
import {ensureCreditSchema} from "./credit-schema";

export async function getCreditSummary(customerId:string){
  await ensureCreditSchema();
  const db=getDb(),[[account],bills,[wallet]]=await Promise.all([
    db.select().from(creditAccounts).where(eq(creditAccounts.customerId,customerId)).limit(1),
    db.select().from(creditBills).where(eq(creditBills.customerId,customerId)).orderBy(asc(creditBills.dueAt)),
    db.select().from(wallets).where(eq(wallets.customerId,customerId)).limit(1),
  ]);
  const resolvedAccount=account||{customerId,termsDays:7,billDay:1,repaymentDay:10,graceDays:2,status:"active" as const,updatedAt:new Date()};
  const normalizedBills=[];
  for(const bill of bills){
    const cycle=creditCycleForDate(bill.createdAt,resolvedAccount.billDay,resolvedAccount.repaymentDay,resolvedAccount.graceDays),needsMigration=bill.status!=="paid"&&(!bill.statementAt||bill.statementAt.getTime()!==cycle.statementAt.getTime()||bill.dueAt.getTime()!==cycle.dueAt.getTime()||bill.graceEndsAt.getTime()!==cycle.graceEndsAt.getTime());
    if(needsMigration)await db.update(creditBills).set({...cycle,updatedAt:new Date()}).where(eq(creditBills.id,bill.id));
    normalizedBills.push(needsMigration?{...bill,...cycle}:bill);
  }
  const openBills=normalizedBills.filter(item=>item.status!=="paid"),billOutstanding=openBills.reduce((sum,item)=>sum+Math.max(0,item.amount-item.repaidAmount),0),legacyUsed=Math.max(0,-Number(wallet?.balance||0)),creditUsed=Number((billOutstanding+legacyUsed).toFixed(2)),creditLimit=Number(wallet?.creditLimit||0);
  const statementMap=new Map<string,{id:string;statementAt:Date;dueAt:Date;graceEndsAt:Date;currency:string;amount:number;repaidAmount:number;outstanding:number;status:string;orderIds:string[]}>();
  for(const bill of normalizedBills){const cycle=creditCycleForDate(bill.createdAt,resolvedAccount.billDay,resolvedAccount.repaymentDay,resolvedAccount.graceDays),statementAt=bill.statementAt||cycle.statementAt,key=bill.dueAt.toISOString().slice(0,10),current=statementMap.get(key)||{id:`CS-${key}`,statementAt,dueAt:bill.dueAt,graceEndsAt:bill.graceEndsAt,currency:bill.currency,amount:0,repaidAmount:0,outstanding:0,status:"paid",orderIds:[]};current.amount+=bill.amount;current.repaidAmount+=bill.repaidAmount;current.outstanding+=Math.max(0,bill.amount-bill.repaidAmount);current.orderIds.push(bill.orderId);if(bill.status==="overdue")current.status="overdue";else if(bill.status!=="paid"&&current.status!=="overdue")current.status=statementAt>new Date()?"unbilled":"unpaid";statementMap.set(key,current)}
  const statements=[...statementMap.values()].map(x=>({...x,amount:Number(x.amount.toFixed(2)),repaidAmount:Number(x.repaidAmount.toFixed(2)),outstanding:Number(x.outstanding.toFixed(2)),orderCount:x.orderIds.length})).sort((a,b)=>a.dueAt.getTime()-b.dueAt.getTime());
  return{account:resolvedAccount,bills:normalizedBills,statements,openBills,creditLimit,creditUsed,availableCredit:Math.max(0,Number((creditLimit-creditUsed).toFixed(2))),legacyUsed};
}

export function creditCycleForDate(date:Date,billDay=1,repaymentDay=10,graceDays=2){
  const clamp=(year:number,month:number,day:number)=>Math.min(day,new Date(year,month+1,0).getDate()),year=date.getFullYear(),month=date.getMonth();let statementAt=new Date(year,month,clamp(year,month,billDay),0,0,0,0);
  if(date>=statementAt)statementAt=new Date(year,month+1,clamp(year,month+1,billDay),0,0,0,0);
  const dueMonth=repaymentDay>billDay?statementAt.getMonth():statementAt.getMonth()+1,dueAt=new Date(statementAt.getFullYear(),dueMonth,clamp(statementAt.getFullYear(),dueMonth,repaymentDay),23,59,59,999),graceEndsAt=new Date(dueAt.getTime()+graceDays*86400000);
  return{statementAt,dueAt,graceEndsAt};
}

export async function ensureCreditAccount(customerId:string,billDay=1,repaymentDay=10,graceDays=2){
  await ensureCreditSchema();const db=getDb(),[current]=await db.select().from(creditAccounts).where(eq(creditAccounts.customerId,customerId)).limit(1);
  if(!current)await db.insert(creditAccounts).values({customerId,termsDays:7,billDay,repaymentDay,graceDays,status:"active",updatedAt:new Date()});
}

export async function refreshCreditRisk(customerId:string,now=new Date()){
  const summary=await getCreditSummary(customerId),db=getDb();let status:"active"|"overdue"|"frozen"="active";
  for(const bill of summary.openBills){if(bill.dueAt<=now){await db.update(creditBills).set({status:"overdue",updatedAt:now}).where(eq(creditBills.id,bill.id));status=bill.graceEndsAt<=now?"frozen":"overdue"}}
  if(summary.account.status!==status)await db.update(creditAccounts).set({status,updatedAt:now}).where(eq(creditAccounts.customerId,customerId));
  return{...summary,status};
}

export async function runCreditRiskChecks(now=new Date()){
  await ensureCreditSchema();
  const db=getDb(),accounts=await db.select().from(creditAccounts);let overdue=0,frozen=0,notificationsCreated=0;
  for(const account of accounts){
    const before=account.status,summary=await refreshCreditRisk(account.customerId,now),status=summary.status;
    if(status==="overdue")overdue++;if(status==="frozen")frozen++;
    const[customer]=await db.select().from(customers).where(eq(customers.id,account.customerId)).limit(1);if(!customer)continue;
    if(status!==before&&status!=="active"){
      const type=`credit:${status}:${now.toISOString().slice(0,10)}`,[existing]=await db.select({id:notifications.id}).from(notifications).where(and(eq(notifications.customerId,customer.id),eq(notifications.type,type))).limit(1);
      if(!existing){await db.insert(notifications).values({id:crypto.randomUUID(),customerId:customer.id,type,title:status==="frozen"?"信用功能已冻结":"信用账单已经逾期",body:status==="frozen"?"信用账单已超过宽限期，信用支付和自动续费已暂停，请还清欠款后恢复。":"信用账单已到还款日，请在宽限期内完成还款。",link:"/dashboard?tab=wallet",read:false,createdAt:now});notificationsCreated++}
    }
    if(status==="frozen"){
      const customerOrders=await db.select({id:orders.id}).from(orders).where(eq(orders.customerEmail,customer.email)),ids=customerOrders.map(x=>x.id);
      await db.update(orders).set({autoRenew:false,updatedAt:now}).where(eq(orders.customerEmail,customer.email));
      if(ids.length)await db.update(proxyAllocations).set({autoRenew:false}).where(inArray(proxyAllocations.orderId,ids));
    }
  }
  return{scanned:accounts.length,overdue,frozen,notificationsCreated};
}
