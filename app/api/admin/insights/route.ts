import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { customers, orders, walletTransactions } from "../../../../db/schema";

export async function GET(){
 if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
 const db=getDb(),[orderRows,transactions,customerRows]=await Promise.all([db.select().from(orders).orderBy(desc(orders.createdAt)),db.select().from(walletTransactions).orderBy(desc(walletTransactions.createdAt)).limit(100),db.select({id:customers.id,email:customers.email,name:customers.name}).from(customers).where(eq(customers.role,"customer"))]);
 const paid=new Set(["paid","provisioning","active"]),revenue=orderRows.filter(x=>paid.has(x.status)).reduce((s,x)=>s+x.amount,0),refunded=orderRows.filter(x=>x.status==="refunded").reduce((s,x)=>s+x.amount,0);
 const customerMap=new Map<string,{email:string;orders:number;spent:number;quantity:number}>();for(const x of orderRows){const row=customerMap.get(x.customerEmail)||{email:x.customerEmail,orders:0,spent:0,quantity:0};row.orders++;row.quantity+=x.quantity;if(paid.has(x.status))row.spent+=x.amount;customerMap.set(x.customerEmail,row)}
 const names=new Map(customerRows.map(x=>[x.email,x.name]));const rankings=[...customerMap.values()].map(x=>({...x,name:names.get(x.email)||null})).sort((a,b)=>b.spent-a.spent).slice(0,20);
 const months=new Map<string,{month:string;orders:number;revenue:number}>();for(const x of orderRows){const key=new Date(x.createdAt).toISOString().slice(0,7),row=months.get(key)||{month:key,orders:0,revenue:0};row.orders++;if(paid.has(x.status))row.revenue+=x.amount;months.set(key,row)}
 const customersById=new Map(customerRows.map(x=>[x.id,x]));
 const ordersById=new Map(orderRows.map(order=>[order.id,order]));
 const namedTransactions=transactions.map(transaction=>{const related=transaction.referenceId?ordersById.get(transaction.referenceId):null;return{...transaction,customerName:customersById.get(transaction.customerId)?.name||"未设置名称",customerEmail:customersById.get(transaction.customerId)?.email||null,relatedOrder:related?{id:related.id,product:related.product,region:related.region,quantity:related.quantity,status:related.status,paymentMethod:related.paymentMethod}:null}});
 return NextResponse.json({summary:{revenue:Number(revenue.toFixed(2)),refunded:Number(refunded.toFixed(2)),netRevenue:Number((revenue-refunded).toFixed(2)),orders:orderRows.length,paidOrders:orderRows.filter(x=>paid.has(x.status)).length,customers:customerRows.length},rankings,months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12),transactions:namedTransactions});
}
