"use client";

import { useEffect, useMemo, useState } from "react";
import Pagination from "../Pagination";
import { countryName } from "../../lib/countries";

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
    const prompt = action === "approve"
      ? "确认该续费已经核验通过？客户服务时间已在付款时延长。"
      : "确认核验不通过？系统将退款到客户余额，并恢复续费前的到期时间。";
    if (!confirm(prompt)) return;
    setBusy(`${id}:${action}`);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/complete-renewal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) return setMessage(data.error || "续费核验失败");
    setMessage(action === "approve" ? "续费核验通过，订单已完成" : `核验不通过，已退款 ¥${Number(data.refund || 0).toFixed(2)} 并恢复原到期时间`);
    await load();
  }

  return <div className="renewal-order-page">
    <section className="product-order-hero">
      <div><small>业务管理</small><h2>续费订单</h2><p>客户付款后立即延长服务时间；此处只负责人工核验，不通过时自动退款并回滚到期时间。</p></div>
      <button onClick={() => void load()}>刷新数据</button>
    </section>
    {message && <div className="auth-success">{message}</div>}
    <section className="product-order-list">
      <header><div><h3>续费核验明细</h3><p>待核验订单不会再次延长服务，避免重复续期。</p></div><div><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索续费单号、客户或商品" /></div></header>
      <div className="renewal-business-table">
        <div className="renewal-business-row head"><span>续费单号</span><span>客户</span><span>服务信息</span><span>WiFi 名称</span><span>地区</span><span>续费周期</span><span>续费金额</span><span>下单时间</span><span>状态</span><span>核验操作</span></div>
        {visible.map((row) => <div className="renewal-business-row" key={row.id}>
          <span><b className="mono">{row.id}</b></span>
          <span><b>{row.customerName || "未设置名称"}</b><small>{row.customerEmail}</small></span>
          <span><b className={row.service?.kind==="proxy"?"mono renewal-service-ip":""}>{row.service?.label||"未找到关联服务"}</b><small>{products[row.product] || row.product}</small></span>
          <span><b>{row.service?.kind==="node"?"—":row.service?.wifiName||"未设置"}</b></span>
          <span><b>{countryName(row.service?.country||row.region)}</b><small>{row.service?.city||row.service?.country||row.region}</small></span>
          <span>{row.durationDays} 天</span><strong>¥{Number(row.amount).toFixed(2)}</strong>
          <span>{new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
          <span><em className={`order-status ${row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")?"provisioning":row.status}`}>{row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")?"待核验":states[row.status] || row.status}</em></span>
          <span>{["paid", "provisioning"].includes(row.status)||(row.status==="active"&&!row.adminNote?.includes("[RENEWAL_VERIFIED_AT]")) ? <span className="verify-actions"><button className="primary" disabled={busy?.startsWith(`${row.id}:`)} aria-busy={busy === `${row.id}:approve`} onClick={() => void verify(row.id, "approve")}>{busy === `${row.id}:approve` ? "处理中…" : "核验通过"}</button><button className="reject" disabled={busy?.startsWith(`${row.id}:`)} aria-busy={busy === `${row.id}:reject`} onClick={() => void verify(row.id, "reject")}>{busy === `${row.id}:reject` ? "处理中…" : "不通过"}</button></span> : <button disabled>{row.status === "pending" ? "等待付款" : "已核验"}</button>}</span>
        </div>)}
        {!loading && !visible.length && <div className="empty">暂无续费订单</div>}
        {loading && <div className="empty">正在加载续费订单…</div>}
      </div>
      <Pagination total={filtered.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
    </section>
  </div>;
}
