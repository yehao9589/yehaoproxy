import { and, desc, eq, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import { customers, orders, proxyAllocations, serviceRequests, wallets, walletTransactions } from "../../../../../db/schema";
import { requireAdminApi } from "../../../../../lib/admin-auth";
import { audit } from "../../../../../lib/audit";
import { fetchXPanelTraffic, getXPanelBinding, resetXPanelCycle } from "../../../../../lib/xpanel";
import { encryptCredential } from "../../../../../lib/inventory-crypto";
import { normalizeCityName } from "../../../../../lib/cities";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  const db = getDb();
  const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)).limit(1);
  if (!request) return NextResponse.json({ error: "售后申请不存在" }, { status: 404 });
  if(action==="verify"){
    if(request.type!=="renew"||request.status!=="completed")return NextResponse.json({error:"只有已自动完成的续费订单可以核验"},{status:409});
    const[allocation]=await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,request.allocationId)).limit(1);
    const[sourceOrder]=allocation?[]:await db.select().from(orders).where(eq(orders.id,request.allocationId)).limit(1);
    if(!allocation&&!sourceOrder)return NextResponse.json({error:"续费对应的服务资源不存在"},{status:409});
    const issues:string[]=[];
    if(!request.durationDays||![7,30,90].includes(request.durationDays))issues.push("续费时长异常");
    if(request.amount==null||request.amount<0)issues.push("续费金额异常");
    const expiresAt=allocation?.expiresAt||sourceOrder?.expiresAt;
    if(!expiresAt||expiresAt<=request.createdAt)issues.push("到期时间未正确延长");
    const verifiedAt=new Date(),note=`[已核验 ${verifiedAt.toLocaleString("zh-CN",{hour12:false})}] ${issues.length?`发现异常：${issues.join("、")}`:"金额、时长、资源和到期时间均正常"}`;
    await db.update(serviceRequests).set({adminNote:note,updatedAt:verifiedAt}).where(eq(serviceRequests.id,id));
    await audit(admin,"service.renew.verify","service_request",id,{resourceId:request.allocationId,resourceType:allocation?"proxy":"node",issues},req);
    return NextResponse.json({ok:true,verified:true,issues,note});
  }
  const retryCompletedTrafficReset = request.type === "reset_traffic" && request.status === "completed" && action === "approve";
  if (request.status !== "pending" && !retryCompletedTrafficReset) {
    return NextResponse.json({ error: "售后申请已经处理" }, { status: 409 });
  }
  const now = new Date();
  let linkedBillId=String(request.reason||"").match(/(?:RP|RS|MB|FR|AS|YH)-[A-Z0-9-]+/)?.[0]||null;
  if(!linkedBillId){
    const[freeReplacementBill]=await db.select({id:orders.id}).from(orders).where(like(orders.adminNote,`%[FREE_REPLACEMENT_REQUEST]${id}%`)).limit(1);
    linkedBillId=freeReplacementBill?.id||null;
  }
  if(!linkedBillId){
    const[requestCustomer]=await db.select({email:customers.email}).from(customers).where(eq(customers.id,request.customerId)).limit(1);
    if(requestCustomer){
      const candidateBills=await db.select().from(orders).where(eq(orders.customerEmail,requestCustomer.email)).orderBy(desc(orders.createdAt)).limit(100);
      const linkedCandidate=candidateBills.find((order)=>{
        if(!["ip-replacement","node-traffic-reset"].includes(order.product)&&order.durationDays!==0)return false;
        const note=String(order.adminNote||"");
        const targetId=note.match(/\[(?:REPLACE_ALLOCATION|RESET_OF|TARGET_ORDER)\]([^\n]+)/)?.[1]?.trim();
        return targetId===request.allocationId;
      });
      linkedBillId=linkedCandidate?.id||null;
    }
  }
  if (action === "reject") {
    await db.update(serviceRequests).set({
      status: "rejected",
      adminNote: String(body?.note || "").slice(0, 500),
      updatedAt: now,
    }).where(eq(serviceRequests.id, id));
    let refundedOrderId:string|null=null,refundAmount=0;
    if(linkedBillId){
      const[linkedOrder]=await db.select().from(orders).where(eq(orders.id,linkedBillId)).limit(1);
      if(linkedOrder&&["paid","provisioning","active"].includes(linkedOrder.status)){
        const[customer]=await db.select().from(customers).where(eq(customers.email,linkedOrder.customerEmail)).limit(1);
        if(customer){
          let[wallet]=await db.select().from(wallets).where(eq(wallets.customerId,customer.id)).limit(1);
          if(!wallet){
            await db.insert(wallets).values({customerId:customer.id,balance:0,frozen:0,creditLimit:0,currency:linkedOrder.currency,updatedAt:now});
            wallet={customerId:customer.id,balance:0,frozen:0,creditLimit:0,currency:linkedOrder.currency,updatedAt:now};
          }
          refundAmount=Number(linkedOrder.amount||0);
          const balanceAfter=Number((wallet.balance+refundAmount).toFixed(2));
          await db.update(wallets).set({balance:balanceAfter,updatedAt:now}).where(eq(wallets.customerId,customer.id));
          await db.insert(walletTransactions).values({id:`WT-${crypto.randomUUID()}`,customerId:customer.id,type:"refund",amount:refundAmount,balanceAfter,referenceType:"service_request_reject",referenceId:id,note:`售后申请 ${id} 已拒绝，款项退回账户余额`,operatorId:admin.id,createdAt:now});
        }
        await db.update(orders).set({status:"refunded",updatedAt:now,adminNote:`${linkedOrder.adminNote||""}\n[SERVICE_REQUEST_REJECTED]${id}`.trim()}).where(eq(orders.id,linkedBillId));
        refundedOrderId=linkedBillId;
      }
    }
    await audit(admin, "service.reject", "service_request", id, { note: body?.note,refundedOrderId,refundAmount }, req);
    return NextResponse.json({ ok: true, status: "rejected",refundedOrderId,refundAmount });
  }
  if (action !== "approve") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }

  if (request.type === "reset_traffic") {
    const binding = await getXPanelBinding(request.allocationId);
    if (!binding) {
      await audit(admin,"service.traffic_reset.failed","order",request.allocationId,{requestId:id,resetOrderId:linkedBillId,error:"节点服务尚未绑定 VPS"},req);
      return NextResponse.json({ error: "该节点服务尚未绑定 VPS，无法执行流量重置" }, { status: 409 });
    }
    try {
      await fetchXPanelTraffic(binding);
      await resetXPanelCycle(binding.serverId);
      await fetchXPanelTraffic(binding);
    } catch (error) {
      const errorMessage=error instanceof Error?error.message:"未知错误";
      await audit(admin,"service.traffic_reset.failed","order",request.allocationId,{requestId:id,resetOrderId:linkedBillId,serverId:binding.serverId,error:errorMessage},req);
      return NextResponse.json({
        error: `流量重置失败：${errorMessage}`,
      }, { status: 409 });
    }
    const resetOrderId = linkedBillId||request.reason?.match(/已付款重置订单\s+(\S+)/)?.[1];
    await db.update(serviceRequests).set({
      status: "completed",
      adminNote: String(body?.note || "节点流量已重置").slice(0, 500),
      updatedAt: now,
    }).where(eq(serviceRequests.id, id));
    if (resetOrderId) {
      await db.update(orders).set({ status: "active", updatedAt: now }).where(eq(orders.id, resetOrderId));
    }
    await audit(
      admin,
      "service.traffic_reset.complete",
      "order",
      request.allocationId,
      { requestId: id, resetOrderId, note: body?.note },
      req,
    );
    return NextResponse.json({ ok: true, status: "completed" });
  }
  if (request.type === "custom") {
    const paidOrderId = linkedBillId||request.reason?.match(/已付款订单\s+(\S+)/)?.[1];
    await db.update(serviceRequests).set({
      status: "completed",
      adminNote: String(body?.note || "一次性服务已处理完成").slice(0, 500),
      updatedAt: now,
    }).where(eq(serviceRequests.id, id));
    if (paidOrderId) await db.update(orders).set({ status: "active", updatedAt: now }).where(eq(orders.id, paidOrderId));
    await audit(admin, "service.custom.complete", "order", request.allocationId, { requestId: id, paidOrderId, note: body?.note }, req);
    return NextResponse.json({ ok: true, status: "completed" });
  }

  const [allocation] = await db
    .select()
    .from(proxyAllocations)
    .where(eq(proxyAllocations.id, request.allocationId))
    .limit(1);
  if (!allocation || allocation.status !== "active") {
    return NextResponse.json({ error: "原代理已失效" }, { status: 409 });
  }
  if (request.type === "renew") {
    const base = allocation.expiresAt && allocation.expiresAt > now ? allocation.expiresAt : now;
    const expiresAt = new Date(base.getTime() + (request.durationDays || 0) * 86400000);
    await db.update(proxyAllocations).set({ expiresAt }).where(eq(proxyAllocations.id, allocation.id));
    await db.update(serviceRequests).set({
      status: "completed",
      adminNote: String(body?.note || "人工确认续费"),
      updatedAt: now,
    }).where(eq(serviceRequests.id, id));
    await audit(admin, "service.renew.complete", "proxy", allocation.id, { expiresAt }, req);
    return NextResponse.json({ ok: true, status: "completed", expiresAt });
  }

  const host=String(body?.host||"").trim(),port=Number(body?.port),username=String(body?.username||"").trim()||null,password=String(body?.password||""),wifiName=String(body?.wifiName||"").trim()||null,protocol=String(body?.protocol||allocation.protocol||"HTTPS").toUpperCase(),country=String(body?.country||"").trim().toUpperCase(),city=normalizeCityName(String(body?.city||""));
  if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol)||!/^[A-Z]{2}$/.test(country)||!city){
    return NextResponse.json({error:"请填写完整的新 IP、端口、国家、城市和协议后再确认更换"},{status:400});
  }
  await db.update(proxyAllocations).set({
    host,port,username,wifiName,protocol,
    encryptedPassword:password?await encryptCredential(password):allocation.encryptedPassword,
    note:`[CITY]${city}`,
  }).where(eq(proxyAllocations.id,allocation.id));
  await db.update(serviceRequests).set({
    status: "completed",
    adminNote: String(body?.note || `已更换为 ${host}:${port}（${country} / ${city}）`),
    updatedAt: now,
  }).where(eq(serviceRequests.id, id));
  if(linkedBillId)await db.update(orders).set({status:"active",updatedAt:now}).where(eq(orders.id,linkedBillId));
  await audit(admin, "service.replace.complete", "proxy", allocation.id, { manual: true,host,port,country,city,linkedBillId:linkedBillId||null }, req);
  return NextResponse.json({ ok: true, status: "completed",host,port });
}
