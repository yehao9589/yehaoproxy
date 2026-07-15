import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { customers, inventory, orders, walletTransactions } from "../../../../db/schema";

export async function GET(){
 if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
 const db=getDb(),[orderRows,stocks,transactions,customerRows]=await Promise.all([db.select().from(orders).orderBy(desc(orders.createdAt)),db.select().from(inventory),db.select().from(walletTransactions).orderBy(desc(walletTransactions.createdAt)).limit(100),db.select({id:customers.id,email:customers.email,name:customers.name}).from(customers).where(eq(customers.role,"customer"))]);
 const paid=new Set(["paid","provisioning","active"]),revenue=orderRows.filter(x=>paid.has(x.status)).reduce((s,x)=>s+x.amount,0),refunded=orderRows.filter(x=>x.status==="refunded").reduce((s,x)=>s+x.amount,0);
 const productMap=new Map<string,{product:string;country:string;total:number;available:number;allocated:number;cost:number;saleValue:number}>();for(const x of stocks){const key=`${x.product}:${x.country}`,row=productMap.get(key)||{product:x.product,country:x.country,total:0,available:0,allocated:0,cost:0,saleValue:0};row.total++;if(x.status==="available")row.available++;if(x.status==="allocated")row.allocated++;row.cost+=x.cost||0;row.saleValue+=x.salePrice;productMap.set(key,row)}
 const customerMap=new Map<string,{email:string;orders:number;spent:number;quantity:number}>();for(const x of orderRows){const row=customerMap.get(x.customerEmail)||{email:x.customerEmail,orders:0,spent:0,quantity:0};row.orders++;row.quantity+=x.quantity;if(paid.has(x.status))row.spent+=x.amount;customerMap.set(x.customerEmail,row)}
 const names=new Map(customerRows.map(x=>[x.email,x.name]));const rankings=[...customerMap.values()].map(x=>({...x,name:names.get(x.email)||null})).sort((a,b)=>b.spent-a.spent).slice(0,20);
 const months=new Map<string,{month:string;orders:number;revenue:number}>();for(const x of orderRows){const key=new Date(x.createdAt).toISOString().slice(0,7),row=months.get(key)||{month:key,orders:0,revenue:0};row.orders++;if(paid.has(x.status))row.revenue+=x.amount;months.set(key,row)}
 return NextResponse.json({summary:{revenue:Number(revenue.toFixed(2)),refunded:Number(refunded.toFixed(2)),netRevenue:Number((revenue-refunded).toFixed(2)),orders:orderRows.length,paidOrders:orderRows.filter(x=>paid.has(x.status)).length,customers:customerRows.length,inventory:stocks.length,available:stocks.filter(x=>x.status==="available").length},products:[...productMap.values()].map(x=>({...x,cost:Number(x.cost.toFixed(2)),saleValue:Number(x.saleValue.toFixed(2))})).sort((a,b)=>b.total-a.total),rankings,months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12),transactions});
}
