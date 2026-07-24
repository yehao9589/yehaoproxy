import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import { inventory, orders, proxyAllocations, serviceRequests } from "../../../../../db/schema";
import { requireAdminApi } from "../../../../../lib/admin-auth";
import { audit } from "../../../../../lib/audit";

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
  if (request.status !== "pending") {
    return NextResponse.json({ error: "售后申请已经处理" }, { status: 409 });
  }
  const now = new Date();
  if (action === "reject") {
    await db.update(serviceRequests).set({
      status: "rejected",
      adminNote: String(body?.note || "").slice(0, 500),
      updatedAt: now,
    }).where(eq(serviceRequests.id, id));
    await audit(admin, "service.reject", "service_request", id, { note: body?.note }, req);
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  if (action !== "approve") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }

  if (request.type === "reset_traffic") {
    const resetOrderId = request.reason?.match(/已付款重置订单\s+(\S+)/)?.[1];
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

  const [originalOrder] = await db.select().from(orders).where(eq(orders.id, allocation.orderId)).limit(1);
  if (!originalOrder) return NextResponse.json({ error: "原订单不存在" }, { status: 409 });
  const [replacement] = await db.select().from(inventory).where(and(
    eq(inventory.product, originalOrder.product),
    eq(inventory.country, originalOrder.region),
    eq(inventory.status, "available"),
  )).limit(1);
  if (!replacement) {
    return NextResponse.json({ error: "没有同产品同地区的可用库存" }, { status: 409 });
  }
  await db.update(inventory).set({
    status: "allocated",
    reservedByOrderId: originalOrder.id,
    updatedAt: now,
  }).where(and(eq(inventory.id, replacement.id), eq(inventory.status, "available")));
  await db.update(proxyAllocations).set({
    host: replacement.host,
    port: replacement.port,
    username: replacement.username,
    encryptedPassword: replacement.encryptedPassword,
    protocol: replacement.protocol,
    note: `${allocation.note || ""} [已更换]`.trim(),
  }).where(eq(proxyAllocations.id, allocation.id));
  await db.update(inventory).set({
    status: "disabled",
    reservedByOrderId: null,
    updatedAt: now,
  }).where(and(eq(inventory.host, allocation.host), eq(inventory.port, allocation.port)));
  await db.update(serviceRequests).set({
    status: "completed",
    adminNote: String(body?.note || "更换完成"),
    updatedAt: now,
  }).where(eq(serviceRequests.id, id));
  await audit(
    admin,
    "service.replace.complete",
    "proxy",
    allocation.id,
    { oldHost: allocation.host, newHost: replacement.host },
    req,
  );
  return NextResponse.json({ ok: true, status: "completed" });
}
