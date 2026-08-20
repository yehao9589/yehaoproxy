import {and,eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers,orders,paymentTransactions,proxyAllocations,wallets,walletTransactions} from "../db/schema";
import {withRequestLock} from "./request-lock";
import {addBillingPeriod,billingCycleFromNote} from "./billing-period";

export async function completeOnlinePayment(input:{orderId:string;gatewayId:string;tradeNo:string;paidAmount:number}){
  return withRequestLock(`online-payment:${input.orderId}`,async()=>{
    const db=getDb(),[order]=await db.select().from(orders).where(eq(orders.id,input.orderId)).limit(1);
    if(!order)throw new Error("订单不存在");
    const[transaction]=await db.select().from(paymentTransactions).where(and(eq(paymentTransactions.orderId,order.id),eq(paymentTransactions.gatewayId,input.gatewayId))).limit(1);
    if(!transaction)throw new Error("支付流水不存在");
    if(transaction.status==="succeeded")return{duplicate:true,order};
    if(order.status!=="pending")throw new Error("订单状态不允许确认支付");
    if(Math.abs(transaction.amount-input.paidAmount)>0.001)throw new Error("支付宝到账金额与支付流水不一致");
    const now=new Date();
    type Q=Parameters<typeof db.batch>[0][number];
    const writes:Q[]=[db.update(paymentTransactions).set({status:"succeeded",externalId:input.tradeNo,updatedAt:now}).where(and(eq(paymentTransactions.id,transaction.id),eq(paymentTransactions.status,"created")))];
    if(order.product==="wallet-topup"){
      const[customer]=await db.select().from(customers).where(eq(customers.email,order.customerEmail)).limit(1);
      if(!customer)throw new Error("充值客户不存在");
      let[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,customer.id)).limit(1);
      if(!wallet){await db.insert(wallets).values({customerId:customer.id,balance:0,frozen:0,creditLimit:0,currency:order.currency,updatedAt:now});[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,customer.id)).limit(1)}
      const balance=Number((wallet.balance+order.amount).toFixed(2));
      writes.push(db.update(wallets).set({balance,updatedAt:now}).where(and(eq(wallets.customerId,customer.id),eq(wallets.balance,wallet.balance))));
      writes.push(db.insert(walletTransactions).values({id:`WT-ALI-${order.id}`,customerId:customer.id,type:"deposit",amount:order.amount,balanceAfter:balance,referenceType:"order",referenceId:order.id,note:`支付宝充值 ${order.id}`,createdAt:now}));
      writes.push(db.update(orders).set({status:"active",paymentMethod:"alipay",paymentReference:input.tradeNo,updatedAt:now}).where(eq(orders.id,order.id)));
    }else{
      const directRenewalSourceId=order.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1],directRenewalAllocationId=order.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1],bundleRenewal=order.product==="cart-bundle"&&order.adminNote?.includes("[BUNDLE_RENEWAL]true");writes.push(db.update(orders).set({status:bundleRenewal||Boolean(directRenewalSourceId)?"active":"provisioning",paymentMethod:"alipay",paymentReference:input.tradeNo,updatedAt:now}).where(eq(orders.id,order.id)));
      if(directRenewalSourceId){const[source]=await db.select().from(orders).where(and(eq(orders.id,directRenewalSourceId),eq(orders.customerEmail,order.customerEmail))).limit(1);if(!source||source.status==="refunded")throw new Error("续费对应的原服务不存在或已退款");const cycle=billingCycleFromNote(source.adminNote||order.adminNote),base=source.expiresAt&&source.expiresAt>now?source.expiresAt:now;writes.push(db.update(orders).set({status:"active",expiresAt:addBillingPeriod(base,order.durationDays,cycle),updatedAt:now}).where(eq(orders.id,source.id)));let previousAllocationExpiry="";if(directRenewalAllocationId){const[allocation]=await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,directRenewalAllocationId)).limit(1);if(!allocation)throw new Error("续费对应的代理资源不存在");previousAllocationExpiry=allocation.expiresAt?.toISOString()||"";const allocationBase=allocation.expiresAt&&allocation.expiresAt>now?allocation.expiresAt:now;writes.push(db.update(proxyAllocations).set({expiresAt:addBillingPeriod(allocationBase,order.durationDays,cycle)}).where(eq(proxyAllocations.id,allocation.id)))}writes.push(db.update(orders).set({adminNote:`${order.adminNote||""}\n[RENEW_PREVIOUS_SOURCE_EXPIRY]${source.expiresAt?.toISOString()||""}\n[RENEW_PREVIOUS_ALLOCATION_EXPIRY]${previousAllocationExpiry}\n[RENEW_APPLIED_AT]${now.toISOString()}`.trim(),updatedAt:now}).where(eq(orders.id,order.id)))}
      if(order.product==="cart-bundle"){
        const children=(await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail))).filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${order.id}`));
        for(const child of children){
          writes.push(db.update(orders).set({status:child.adminNote?.includes("[RENEWAL_OF]")?"active":"provisioning",paymentMethod:"alipay",paymentReference:input.tradeNo,updatedAt:now}).where(eq(orders.id,child.id)));
          const sourceId=child.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1],allocationId=child.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1];
          if(sourceId){const[source]=await db.select().from(orders).where(and(eq(orders.id,sourceId),eq(orders.customerEmail,order.customerEmail))).limit(1);if(!source||source.status==="refunded")throw new Error(`续费明细 ${child.id} 对应的原服务不存在或已退款`);const cycle=billingCycleFromNote(source.adminNote||child.adminNote),base=source.expiresAt&&source.expiresAt>now?source.expiresAt:now;writes.push(db.update(orders).set({status:"active",expiresAt:addBillingPeriod(base,child.durationDays,cycle),updatedAt:now}).where(eq(orders.id,source.id)));let previousAllocationExpiry="";if(allocationId){const[allocation]=await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,allocationId)).limit(1);if(!allocation)throw new Error(`续费明细 ${child.id} 对应的代理资源不存在`);previousAllocationExpiry=allocation.expiresAt?.toISOString()||"";const allocationBase=allocation.expiresAt&&allocation.expiresAt>now?allocation.expiresAt:now;writes.push(db.update(proxyAllocations).set({expiresAt:addBillingPeriod(allocationBase,child.durationDays,cycle)}).where(eq(proxyAllocations.id,allocation.id)))}writes.push(db.update(orders).set({adminNote:`${child.adminNote||""}\n[RENEW_PREVIOUS_SOURCE_EXPIRY]${source.expiresAt?.toISOString()||""}\n[RENEW_PREVIOUS_ALLOCATION_EXPIRY]${previousAllocationExpiry}\n[RENEW_APPLIED_AT]${now.toISOString()}`.trim(),updatedAt:now}).where(eq(orders.id,child.id)))}
        }
      }
    }
    await db.batch(writes as[Q,...Q[]]);
    return{duplicate:false,order};
  });
}
