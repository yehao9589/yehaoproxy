"use client";

import { useEffect, useMemo, useState } from "react";
import Pagination from "../Pagination";
import { countryName } from "../../lib/countries";
import {billingCycleFromNote,periodLabel} from "../../lib/billing-period";

const states: Record<string, string> = {
  pending: "待付款",
  paid: "待核验",
  provisioning: "待核验",
  active: "续费成功",
  refunded: "核验不通过 / 已退款",
  failed: "已取消",
};
const products: Record<string, string> = {
  "static-isp": "静态住宅 IP",
  "static-residential": "静态住宅 IP",
  "dynamic-residential": "动态住宅代理",
  datacenter: "数据中心代理",
  "soft-router": "软路由中转",
  "computer-node": "电脑节点",
};
type Row = { id: string; customerName?: string | null; customerEmail: string; product: string; region: string; durationDays: number; amount: number; currency: string; status: string; createdAt: string; adminNote: string | null; service?:{label:string;wifiName:string|null;country:string;city:string|null;kind:"proxy"|"node"}|null };

export default function RenewalOrders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingVerify, setPendingVerify] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/orders?size=100");
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "续费订单加载失败");
    const renewals=(data.items || []).filter((item: Row) => item.adminNote?.includes("[RENEWAL_OF]"));
    const enriched=await Promise.all(renewals.map(async(item:Row)=>{try{const detailResponse=await fetch(`/api/admin/orders/${encodeURIComponent(item.id)}`),detail=await detailResponse.json(),allocation=detail.renewalContext?.allocation,source=detail.renewalContext?.sourceOrder,isNode=["computer-node","soft-router"].includes(item.product);if(!detailResponse.ok)return{...item,service:null};return{...item,service:{label:isNode?(detail.renewalContext?.vpsName||"未绑定 VPS"):allocation?`${allocation.host}:${allocation.port}`:"未找到关联代理",wifiName:isNode?null:allocation?.wifiName||null,country:source?.region||item.region,city:isNode?null:allocation?.city||null,kind:isNode?"node":"proxy"}}}catch{return{...item,service:null}}}));
    setRows(enriched);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => !query || [row.id, row.customerName, row.customerEmail, row.product, row.region, row.service?.label, row.service?.wifiName, row.service?.country, row.service?.city, states[row.status]].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase()))), [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function verify(id: string, action: "approve" | "reject") {
    if (busy) return;
    setPendingVerify(null);
    setMessage("");
    setBusy(`${id}:${action}`);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/complete-renewal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || `续费核验失败（${response.status}）`);
      const nextMessage = action === "approve" ? "续费核验通过，订单已完成" : `核验不通过，已退款 ¥${Number(data.refund || 0).toFixed(2)} 并恢复原到期时间`;
      setMessage(nextMessage);
      window.dispatchEvent(new CustomEvent("yehao:toast", { detail: { message: nextMessage, kind: "success" } }));
      await load();
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "续费核验失败，请稍后重试";
      setMessage(nextMessage);
      window.dispatchEvent(new CustomEvent("yehao:toast", { detail: { message: nextMessage, kind: "error" } }));
    } finally {
      setBusy(null);
    }
  }

  const pendingCount=rows.filter(row=>["paid","provisioning"].includes(row.status)||(row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]"))).length;
  const verifiedCount=rows.filter(row=>row.status==="active"&&row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")).length;
  const refundedCount=rows.filter(row=>row.status==="refunded").length;
  return <div className="renewal-order-page business-page">
    <section className="product-order-hero business-hero">
      <div><small>RENEWAL OPERATIONS</small><h2>续费订单</h2><p>客户付款后立即延长服务时间；此处只负责人工核验，不通过时自动退款并回滚到期时间。</p></div>
      <button onClick={() => void load()}>刷新数据</button>
    </section>
    <section className="business-metrics"><article><i>续</i><span><small>全部续费</small><b>{rows.length}</b><em>累计续费订单</em></span></article><article><i className="warning">核</i><span><small>等待核验</small><b>{pendingCount}</b><em>需要管理员确认</em></span></article><article><i className="success">成</i><span><small>核验完成</small><b>{verifiedCount}</b><em>续费结果已确认</em></span></article><article><i className="danger">退</i><span><small>核验退款</small><b>{refundedCount}</b><em>不通过并已回滚</em></span></article></section>
    {message && <div className="auth-success">{message}</div>}
    <section className="product-order-list business-workbench">
      <header><div><h3>续费核验明细</h3><p>待核验订单不会再次延长服务，避免重复续期。</p></div><div><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索续费单号、客户或商品" /></div></header>
      <div className="renewal-business-table">
        <div className="renewal-business-row head"><span>续费单号</span><span>客户</span><span>服务信息</span><span>WiFi 名称</span><span>地区</span><span>续费周期</span><span>续费金额</span><span>下单时间</span><span>状态</span><span>核验操作</span></div>
        {visible.map((row) => <div className="renewal-business-row" key={row.id}>
          <span><b className="mono">{row.id}</b></span>
          <span><b>{row.customerName || "未设置名称"}</b><small>{row.customerEmail}</small></span>
          <span><b className={row.service?.kind==="proxy"?"mono renewal-service-ip":""}>{row.service?.label||"未找到关联服务"}</b><small>{products[row.product] || row.product}</small></span>
          <span><b>{row.service?.kind==="node"?"—":row.service?.wifiName||"未设置"}</b></span>
          <span><b>{countryName(row.service?.country||row.region)}</b><small>{row.service?.city||row.service?.country||row.region}</small></span>
          <span>{periodLabel(row.durationDays,billingCycleFromNote(row.adminNote))}</span><strong>¥{Number(row.amount).toFixed(2)}</strong>
          <span>{new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
          <span><em className={`order-status ${row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")?"provisioning":row.status}`}>{row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")?"待核验":states[row.status] || row.status}</em></span>
          <span>{["paid", "provisioning"].includes(row.status)||(row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")) ? <span className="verify-actions"><button className="primary" disabled={busy?.startsWith(`${row.id}:`)} aria-busy={busy === `${row.id}:approve`} onClick={() => setPendingVerify({id:row.id,action:"approve"})}>{busy === `${row.id}:approve` ? "处理中…" : "核验通过"}</button><button className="reject" disabled={busy?.startsWith(`${row.id}:`)} aria-busy={busy === `${row.id}:reject`} onClick={() => setPendingVerify({id:row.id,action:"reject"})}>{busy === `${row.id}:reject` ? "处理中…" : "不通过"}</button></span> : <button disabled>{row.status === "pending" ? "等待付款" : "已核验"}</button>}</span>
        </div>)}
        {!loading && !visible.length && <div className="empty">暂无续费订单</div>}
        {loading && <div className="empty">正在加载续费订单…</div>}
      </div>
      <Pagination total={filtered.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
    </section>
    {pendingVerify&&<div className="customer-payment-mask" onMouseDown={event=>{if(event.target===event.currentTarget)setPendingVerify(null)}}><section className="customer-payment-modal renewal-verify-modal"><header><div><small>续费订单核验</small><h2>{pendingVerify.action==="approve"?"确认核验通过":"确认核验不通过"}</h2><p>{pendingVerify.id}</p></div><button type="button" aria-label="关闭" onClick={()=>setPendingVerify(null)}>×</button></header><p>{pendingVerify.action==="approve"?"客户付款时已经自动延长服务时间。确认后只会完成后台核验，不会再次续期。":"系统将退款至客户余额，并把原服务恢复到续费前的到期时间。"}</p><footer><button type="button" onClick={()=>setPendingVerify(null)}>取消</button><button type="button" className={pendingVerify.action==="approve"?"primary":"danger"} onClick={()=>void verify(pendingVerify.id,pendingVerify.action)}>{pendingVerify.action==="approve"?"确认通过":"确认退款并回滚"}</button></footer></section></div>}
  </div>;
}
