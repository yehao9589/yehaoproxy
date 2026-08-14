import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { customers, orders, paymentTransactions, walletTransactions } from "../../../../db/schema";

export async function GET() {
  if (!await requireAdminApi("overview")) return NextResponse.json({ error: "无运营概览权限" }, { status: 403 });
  const db = getDb();
  const [orderRows, walletRows, paymentRows, customerRows] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(walletTransactions).orderBy(desc(walletTransactions.createdAt)).limit(200),
    db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(200),
    db.select({ id: customers.id, email: customers.email, name: customers.name }).from(customers).where(eq(customers.role, "customer")),
  ]);
  const paid = new Set(["paid", "provisioning", "active"]);
  const revenue = orderRows.filter(order => paid.has(order.status)).reduce((sum, order) => sum + order.amount, 0);
  const refunded = orderRows.filter(order => order.status === "refunded").reduce((sum, order) => sum + order.amount, 0);
  const customerMap = new Map<string, { email:string; orders:number; spent:number; quantity:number }>();
  for (const order of orderRows) {
    const row = customerMap.get(order.customerEmail) || { email:order.customerEmail, orders:0, spent:0, quantity:0 };
    row.orders += 1; row.quantity += order.quantity; if (paid.has(order.status)) row.spent += order.amount;
    customerMap.set(order.customerEmail, row);
  }
  const names = new Map(customerRows.map(customer => [customer.email, customer.name]));
  const rankings = [...customerMap.values()].map(row => ({ ...row, name:names.get(row.email) || null })).sort((a,b) => b.spent-a.spent).slice(0,20);
  const months = new Map<string, { month:string; orders:number; revenue:number }>();
  for (const order of orderRows) {
    const key = new Date(order.createdAt).toISOString().slice(0,7), row = months.get(key) || { month:key, orders:0, revenue:0 };
    row.orders += 1; if (paid.has(order.status)) row.revenue += order.amount; months.set(key,row);
  }
  const customersById = new Map(customerRows.map(customer => [customer.id, customer]));
  const customersByEmail = new Map(customerRows.map(customer => [customer.email, customer]));
  const ordersById = new Map(orderRows.map(order => [order.id, order]));
  const relatedOrder = (orderId:string|null) => {
    const order = orderId ? ordersById.get(orderId) : null;
    return order ? { id:order.id, product:order.product, region:order.region, quantity:order.quantity, status:order.status, paymentMethod:order.paymentMethod } : null;
  };
  const walletRecords = walletRows.map(transaction => {
    const customer = customersById.get(transaction.customerId), order = relatedOrder(transaction.referenceId);
    return { ...transaction, customerName:customer?.name || "未设置名称", customerEmail:customer?.email || null, currency:"CNY", source:"wallet", relatedOrder:order };
  });
  const onlineRecords = paymentRows.filter(transaction => ["succeeded","refunded"].includes(transaction.status)).map(transaction => {
    const order = ordersById.get(transaction.orderId), customer = order ? customersByEmail.get(order.customerEmail) : null;
    return { id:transaction.id, customerId:customer?.id || order?.customerEmail || "unknown", customerName:customer?.name || "未设置名称", customerEmail:customer?.email || order?.customerEmail || null, type:transaction.status === "refunded" ? "original_refund" : "online_payment", amount:transaction.status === "refunded" ? -Math.abs(transaction.amount) : Math.abs(transaction.amount), balanceAfter:null, referenceType:"order", referenceId:transaction.orderId, note:transaction.status === "refunded" ? "原支付渠道退款" : "在线支付收款", operatorId:null, createdAt:transaction.updatedAt, currency:transaction.currency, source:"payment", relatedOrder:relatedOrder(transaction.orderId) };
  });
  const transactions = [...walletRecords,...onlineRecords].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,200);
  return NextResponse.json({ summary:{ revenue:Number(revenue.toFixed(2)), refunded:Number(refunded.toFixed(2)), netRevenue:Number((revenue-refunded).toFixed(2)), orders:orderRows.length, paidOrders:orderRows.filter(order=>paid.has(order.status)).length, customers:customerRows.length }, rankings, months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12), transactions });
}
