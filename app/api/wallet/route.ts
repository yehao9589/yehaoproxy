import {and,count,desc,eq,gte,lt} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {currencies,walletTransactions,wallets} from "../../../db/schema";
import {getCurrentCustomer} from "../../../lib/auth";
import {refreshCreditRisk} from "../../../lib/credit";
import {customerLedgerServices} from "../../../lib/customer-ledger-services";
import {getSiteConfig} from "../../../lib/site-config";
import {walletLedgerQuery,walletPageBounds,walletPageSize} from "../../../lib/wallet-ledger-query";

const paymentNames:Record<string,string>={balance:"余额支付",credit:"信用额支付",alipay:"支付宝",wechat:"微信支付",paypal:"PayPal",usdt:"USDT",bank:"银行转账",manual:"人工收款"};
async function walletSummary(customerId:string){
 const db=getDb(),[[row],[activeCurrency],credit]=await Promise.all([
  db.select().from(wallets).where(eq(wallets.customerId,customerId)).limit(1),
  db.select().from(currencies).where(eq(currencies.isDefault,true)).limit(1),refreshCreditRisk(customerId),
 ]),currency=activeCurrency||{code:"CNY",symbol:"¥",decimalPlaces:2},wallet=row||{customerId,balance:0,frozen:0,creditLimit:0,currency:currency.code};
 return {wallet:{...wallet,currency:currency.code,currencySymbol:currency.symbol,decimalPlaces:currency.decimalPlaces,creditUsed:credit.creditUsed,availableCredit:credit.availableCredit,spendingPower:Math.max(0,wallet.balance)+credit.availableCredit,creditStatus:credit.status,billDay:credit.account.billDay,repaymentDay:credit.account.repaymentDay,graceDays:credit.account.graceDays},creditBills:credit.bills,creditStatements:credit.statements};
}

async function walletLedger(user:{id:string;email:string},query:ReturnType<typeof walletLedgerQuery>){
 const db=getDb(),where=and(eq(walletTransactions.customerId,user.id),
  query.start?gte(walletTransactions.createdAt,query.start):undefined,
  query.endExclusive?lt(walletTransactions.createdAt,query.endExclusive):undefined);
 const [row]=await db.select({total:count()}).from(walletTransactions).where(where);
 const {page,size,total,offset}=walletPageBounds(query.page,query.size,Number(row?.total||0));
 const transactions=total?await db.select().from(walletTransactions).where(where)
  .orderBy(desc(walletTransactions.createdAt),desc(walletTransactions.id)).limit(size).offset(offset):[];
 const referenceIds=[...new Set(transactions.flatMap(transaction=>transaction.referenceId?[transaction.referenceId]:[]))];
 const {services,orderMap}=await customerLedgerServices(user.email,referenceIds);
 const enrichedTransactions=transactions.map(transaction=>{const order=transaction.referenceId?orderMap.get(transaction.referenceId):undefined,paymentMethod=order?.paymentMethod||(transaction.type==="credit_repayment"?"balance":null),paymentLabel=transaction.type==="adjustment"?"后台调账":transaction.type==="refund"?"退至余额":transaction.type==="credit_repayment"?"余额还款":transaction.type==="deposit"&&!order?"余额充值":paymentMethod?paymentNames[paymentMethod]||paymentMethod:"—",creditPurchase=transaction.type==="purchase"&&paymentMethod==="credit";return{...transaction,serviceContext:transaction.referenceId?services.get(transaction.referenceId)||null:null,paymentMethod,paymentLabel,balanceBefore:Number((creditPurchase?transaction.balanceAfter:transaction.balanceAfter-transaction.amount).toFixed(2)),relatedOrder:order||null}});
 return {transactions:enrichedTransactions,pagination:{page,size,total}};
}

export async function GET(req:Request){
 const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const params=new URL(req.url).searchParams,view=params.get("view");
 if(view==="summary")return NextResponse.json(await walletSummary(user.id));
 const size=walletPageSize(params.get("size"))??(await getSiteConfig()).defaultPageSize;
 let query:ReturnType<typeof walletLedgerQuery>;
 try{query=walletLedgerQuery(params,size)}catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:"日期范围无效"},{status:400});
 }
 if(view==="ledger")return NextResponse.json(await walletLedger(user,query));
 const [summary,ledger]=await Promise.all([walletSummary(user.id),walletLedger(user,query)]);
 return NextResponse.json({...summary,...ledger});
}
