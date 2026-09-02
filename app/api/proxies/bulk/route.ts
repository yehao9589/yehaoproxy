import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentCustomer } from "../../../../lib/auth";
import { getDb } from "../../../../db";
import { orders, productOffers, proxyAllocations, systemOptions } from "../../../../db/schema";
import { encryptCredential } from "../../../../lib/inventory-crypto";
import { audit } from "../../../../lib/audit";
import { billingCycleFromNote,periodLabel } from "../../../../lib/billing-period";
import { notifyAdmins } from "../../../../lib/admin-event-notifications";
import {ensureProductOfferSchema} from "../../../../lib/product-offer-schema";
import {nextBusinessId} from "../../../../lib/business-id";

export async function POST(req: Request) {
  await ensureProductOfferSchema();
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ids: string[] = [...new Set<string>((Array.isArray(body?.ids) ? body.ids : []).map((value: unknown) => String(value)))].slice(0, 200);
  const action = String(body?.action || "");
  if (!ids.length) return NextResponse.json({ error: "请选择代理" }, { status: 400 });
  const db = getDb();
  const owned = await db.select({ allocation: proxyAllocations, order: orders })
    .from(proxyAllocations).innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .where(and(eq(orders.customerEmail, user.email), inArray(proxyAllocations.id, ids), eq(proxyAllocations.status, "active")));
  if (owned.length !== ids.length) return NextResponse.json({ error: "部分代理不存在或不属于当前账户" }, { status: 403 });

  if (action === "credentials") {
    if (owned.some(row => row.allocation.expiresAt && row.allocation.expiresAt.getTime() <= Date.now())) return NextResponse.json({ error: "已到期代理不能修改账号密码，请先续费" }, { status: 409 });
    const [option] = await db.select().from(systemOptions).where(eq(systemOptions.key, "customer_node_credential_editing")).limit(1);
    if (option?.value !== "true") return NextResponse.json({ error: "管理员已关闭节点账号密码编辑功能" }, { status: 403 });
    const username = String(body?.username || "").trim() || null, password = String(body?.password || "");
    if (!username && !password) return NextResponse.json({ error: "请填写新用户名或密码" }, { status: 400 });
    const updates: {username?: string; encryptedPassword?: string} = {};
    if (username) updates.username = username;
    if (password) {
      const encryptedPassword = await encryptCredential(password);
      if (encryptedPassword) updates.encryptedPassword = encryptedPassword;
    }
    await db.update(proxyAllocations).set(updates).where(inArray(proxyAllocations.id, ids));
    await audit({id:user.id,role:user.role}, "proxy.bulk_credentials", "proxy", null, {ids,count:ids.length,usernameChanged:!!username,passwordChanged:!!password}, req);
    return NextResponse.json({ok:true,updated:ids.length});
  }

  if (action === "renew") {
    const durationDays = Number(body?.durationDays);
    if (!Number.isInteger(durationDays)||durationDays<1||durationDays>3650) return NextResponse.json({error:"续费周期无效"},{status:400});
    const offers = await db.select().from(productOffers).where(eq(productOffers.enabled,true));
    const now = new Date(), bundleId=owned.length>1?await nextBusinessId("YH",now):null, created: Array<{id:string;amount:number;sourceOrderId:string;product:string;region:string}> = [];
    for (const row of owned) {
      const cycle = billingCycleFromNote(row.order.adminNote);
      if (cycle === "calendar-month"&&durationDays%30!==0) return NextResponse.json({error:"按月续费必须填写完整月数"},{status:409});
      if (cycle !== "calendar-month"&&durationDays===180) return NextResponse.json({error:"6 个月续费仅适用于自然月服务"},{status:409});
      const offer = offers.find(item=>item.product===row.order.product&&item.region===row.order.region);
      const listedPrice = durationDays===7?offer?.price7:durationDays===90?offer?.price90:durationDays===180?offer?.price180:(offer?.price30??0)*(durationDays/30);
      const multiplier = durationDays===7?.35:durationDays/30;
      const amount = Number(((row.order.renewalAmount!=null&&row.order.renewalAmount>0?row.order.renewalAmount*multiplier:Number(listedPrice))).toFixed(2));
      if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:`${row.order.product} / ${row.order.region} 尚未配置该续费价格`},{status:409});
      const renewalId=await nextBusinessId("RN",now);
      await db.insert(orders).values({id:renewalId,customerEmail:user.email,product:row.order.product,region:row.order.region,quantity:1,durationDays,amount,currency:row.order.currency,status:"pending",paymentMethod:"balance",renewalAmount:amount,adminNote:`${bundleId?`[BUNDLE_PARENT]${bundleId}\n`:""}[RENEWAL_OF]${row.order.id}\n[RENEW_ALLOCATION]${row.allocation.id}\n[BILLING_CYCLE]${cycle}`,createdAt:now,updatedAt:now});
      created.push({id:renewalId,amount,sourceOrderId:row.order.id,product:row.order.product,region:row.order.region});
    }
    const total=Number(created.reduce((sum,item)=>sum+item.amount,0).toFixed(2));
    if(bundleId){const bundleItems=encodeURIComponent(JSON.stringify(created.map(item=>({id:item.sourceOrderId,product:item.product,region:item.region,quantity:1,durationDays,amount:item.amount,renewalOrderId:item.id}))));await db.insert(orders).values({id:bundleId,customerEmail:user.email,product:"cart-bundle",region:"MULTI",quantity:created.length,durationDays:0,amount:total,currency:owned[0].order.currency,status:"pending",paymentMethod:"balance",renewalAmount:total,adminNote:`[BUNDLE_ITEMS]${bundleItems}\n[BUNDLE_RENEWAL]true`,createdAt:now,updatedAt:now})}
    const checkoutOrderId=bundleId||created[0]?.id;
    await audit({id:user.id,role:user.role},"proxy.renewal_orders.create","order",checkoutOrderId||null,{allocationIds:ids,orderIds:created.map(item=>item.id),bundleOrderId:bundleId,durationDays,total},req);
    if(checkoutOrderId){
      const sourceSummary=created.length===1?created[0].sourceOrderId:`共 ${created.length} 项服务`;
      const cycles=[...new Set(owned.map(item=>billingCycleFromNote(item.order.adminNote)))];
      const durationLabel=periodLabel(durationDays,cycles.length===1?cycles[0]:"fixed-days");
      await notifyAdmins("admin_renewal",{orderId:checkoutOrderId,customerEmail:user.email,sourceOrderId:sourceSummary,durationDays,durationLabel,amount:`${owned[0].order.currency} ${total.toFixed(2)}`},[{label:"续费账单",value:checkoutOrderId,accent:true},{label:"客户",value:user.email},{label:"原服务",value:sourceSummary},{label:"续费数量",value:`${created.length} 项`},{label:"续费周期",value:durationLabel},{label:"合计金额",value:`${owned[0].order.currency} ${total.toFixed(2)}`}]).catch(()=>{});
    }
    return NextResponse.json({ok:true,created:created.length,orderIds:created.map(item=>item.id),orderId:checkoutOrderId,total,bundled:Boolean(bundleId)});
  }
  if(action==="auto-renew"){
    if (owned.some(row => row.allocation.expiresAt && row.allocation.expiresAt.getTime() <= Date.now())) return NextResponse.json({ error: "已到期代理不能开启自动续费，请先手动续费" }, { status: 409 });
    const enabled=body?.enabled===true;
    await db.update(proxyAllocations).set({autoRenew:enabled}).where(inArray(proxyAllocations.id,ids));
    await audit({id:user.id,role:user.role},"proxy.auto_renew.update","proxy",null,{allocationIds:ids,count:ids.length,enabled},req);
    return NextResponse.json({ok:true,updated:ids.length});
  }
  return NextResponse.json({error:"不支持的批量操作"},{status:400});
}
