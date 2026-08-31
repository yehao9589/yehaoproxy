import {desc,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../db";
import {currencies,orders,walletTransactions,wallets} from "../../../db/schema";
import {getCurrentCustomer} from "../../../lib/auth";
import {refreshCreditRisk} from "../../../lib/credit";

const paymentNames:Record<string,string>={balance:"余额支付",credit:"信用额支付",alipay:"支付宝",wechat:"微信支付",paypal:"PayPal",usdt:"USDT",bank:"银行转账",manual:"人工收款"};
export async function GET(){
 const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const db=getDb(),[[row],transactions,[activeCurrency],credit,customerOrders]=await Promise.all([
  db.select().from(wallets).where(eq(wallets.customerId,user.id)).limit(1),
  db.select().from(walletTransactions).where(eq(walletTransactions.customerId,user.id)).orderBy(desc(walletTransactions.createdAt)).limit(100),
  db.select().from(currencies).where(eq(currencies.isDefault,true)).limit(1),refreshCreditRisk(user.id),
  db.select({id:orders.id,product:orders.product,region:orders.region,quantity:orders.quantity,amount:orders.amount,currency:orders.currency,status:orders.status,paymentMethod:orders.paymentMethod,paymentReference:orders.paymentReference,createdAt:orders.createdAt}).from(orders).where(eq(orders.customerEmail,user.email)),
 ]),currency=activeCurrency||{code:"CNY",symbol:"¥",decimalPlaces:2},wallet=row||{customerId:user.id,balance:0,frozen:0,creditLimit:0,currency:currency.code},orderMap=new Map(customerOrders.map(order=>[order.id,order]));
 const enrichedTransactions=transactions.map(transaction=>{const order=transaction.referenceId?orderMap.get(transaction.referenceId):undefined,paymentMethod=order?.paymentMethod||(transaction.type==="credit_repayment"?"balance":null),paymentLabel=transaction.type==="adjustment"?"后台调账":transaction.type==="refund"?"退至余额":transaction.type==="credit_repayment"?"余额还款":transaction.type==="deposit"&&!order?"余额充值":paymentMethod?paymentNames[paymentMethod]||paymentMethod:"—",creditPurchase=transaction.type==="purchase"&&paymentMethod==="credit";return{...transaction,paymentMethod,paymentLabel,balanceBefore:Number((creditPurchase?transaction.balanceAfter:transaction.balanceAfter-transaction.amount).toFixed(2)),relatedOrder:order||null}});
 return NextResponse.json({wallet:{...wallet,currency:currency.code,currencySymbol:currency.symbol,decimalPlaces:currency.decimalPlaces,creditUsed:credit.creditUsed,availableCredit:credit.availableCredit,spendingPower:Math.max(0,wallet.balance)+credit.availableCredit,creditStatus:credit.status,billDay:credit.account.billDay,repaymentDay:credit.account.repaymentDay,graceDays:credit.account.graceDays},creditBills:credit.bills,creditStatements:credit.statements,transactions:enrichedTransactions});
}
