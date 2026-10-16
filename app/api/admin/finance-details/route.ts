import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getDb} from "../../../../db";
import {orders,paymentTransactions,walletTransactions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
export async function GET(req:Request){
 if(!await requireAdminApi("finance"))return NextResponse.json({error:"无财务管理权限"},{status:403});
 const id=new URL(req.url).searchParams.get("order");if(!id)return NextResponse.json({error:"缺少账单编号"},{status:400});
 const db=getDb();const [order]=await db.select({id:orders.id,customerEmail:orders.customerEmail,product:orders.product,region:orders.region,quantity:orders.quantity,amount:orders.amount,currency:orders.currency,status:orders.status,paymentMethod:orders.paymentMethod,paymentReference:orders.paymentReference,createdAt:orders.createdAt,updatedAt:orders.updatedAt}).from(orders).where(eq(orders.id,id)).limit(1);
 if(!order)return NextResponse.json({error:"未找到关联收款账单"},{status:404});
 const [payments,transactions]=await Promise.all([db.select({id:paymentTransactions.id,externalId:paymentTransactions.externalId,amount:paymentTransactions.amount,currency:paymentTransactions.currency,status:paymentTransactions.status,createdAt:paymentTransactions.createdAt,updatedAt:paymentTransactions.updatedAt}).from(paymentTransactions).where(eq(paymentTransactions.orderId,id)),db.select({id:walletTransactions.id,type:walletTransactions.type,amount:walletTransactions.amount,balanceAfter:walletTransactions.balanceAfter,note:walletTransactions.note,createdAt:walletTransactions.createdAt}).from(walletTransactions).where(eq(walletTransactions.referenceId,id))]);
 return NextResponse.json({order,payments,transactions});
}
