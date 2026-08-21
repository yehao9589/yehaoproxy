"use client";

import { useEffect, useState } from "react";
import {displayCustomerId} from "../../../lib/customer-id";

type RequestItem = {
  id: string;
  customerId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  allocationId: string;
  type: string;
  durationDays: number | null;
  amount: number | null;
  reason: string | null;
  adminNote?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

type Detail = {
  request: RequestItem;
  customer: { id: string; name: string | null; email: string } | null;
  nodeOrder: { id: string; product: string; region: string; status: string; expiresAt: string | null } | null;
  asset: {
    id: string;
    orderId: string;
    host: string;
    port: number;
    username: string | null;
    protocol: string;
    status: string;
    expiresAt: string | null;
    autoRenew: boolean;
    product: string;
    region: string;
    country?: string | null;
    city?: string | null;
  } | null;
};

const statusLabels: Record<string, string> = {
  pending: "待处理",
  approved: "已批准",
  completed: "已完成",
  rejected: "已拒绝",
  cancelled: "已取消",
};

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未设置";
}

export default function RequestsClient() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionDialog, setActionDialog] = useState<{id:string;action:"approve"|"reject"} | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [replacementForm, setReplacementForm] = useState({ host: "", port: "", username: "", password: "", wifiName: "", protocol: "SOCKS5", country: "", city: "" });

  async function load() {
    const response = await fetch("/api/admin/service-requests");
    const data = await response.json();
    if (response.ok) setItems(data.items || []);
    else setError(data.error || "售后申请加载失败");
  }

  useEffect(() => {
    void load();
  }, []);

  async function open(item: RequestItem) {
    setLoading(true);
    const response = await fetch(`/api/admin/customers/${encodeURIComponent(item.customerId)}`);
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || "申请详情加载失败");
    setDetail({
      request: item,
      customer: data.customer || null,
      nodeOrder: (data.orders || []).find((order: { id: string }) => order.id === item.allocationId) || null,
      asset: (data.assets || []).find((asset: { id: string }) => asset.id === item.allocationId) || null,
    });
  }

  function openCustomer(id: string) {
    const nav = [...document.querySelectorAll<HTMLButtonElement>(".admin-pro aside nav button")]
      .find((button) => button.textContent?.includes("客户管理"));
    nav?.click();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("yehao:open-customer", { detail: { id } })), 250);
  }

  function askAction(id:string, action:"approve"|"reject"){
    setActionNote("");
    const asset = detail?.request.id === id ? detail.asset : null;
    const regionCode = String(asset?.region || "").trim().toUpperCase();
    setReplacementForm({
      host: "", port: asset?.port ? String(asset.port) : "", username: asset?.username || "", password: "", wifiName: "",
      protocol: asset?.protocol || "SOCKS5", country: /^[A-Z]{2}$/.test(regionCode) ? regionCode : "", city: asset?.city || "",
    });
    setActionDialog({id,action});
  }

  async function action(id: string, actionName: "approve"|"reject", note: string) {
    if(actionName==="reject"&&!note.trim())return setError("请填写拒绝原因");
    const currentRequest = items.find((item) => item.id === id) || (detail?.request.id === id ? detail.request : null);
    const isReplacement = actionName === "approve" && currentRequest?.type === "replace";
    if (isReplacement && (!replacementForm.host.trim() || !replacementForm.port || !replacementForm.country.trim() || !replacementForm.city.trim())) return setError("请填写完整的新 IP、端口、国家和城市");
    setActionBusy(true);
    const payload = isReplacement ? {
      action: actionName, note: note.trim(), host: replacementForm.host.trim(), port: Number(replacementForm.port),
      username: replacementForm.username.trim(), password: replacementForm.password, wifiName: replacementForm.wifiName.trim(),
      protocol: replacementForm.protocol, country: replacementForm.country.trim().toUpperCase(), city: replacementForm.city.trim(),
    } : { action: actionName, note: note.trim() };
    const response = await fetch(`/api/admin/service-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setActionBusy(false);
    if (!response.ok) return setError(data.error || "处理失败");
    setActionDialog(null);
    setDetail(null);
    await load();
  }

  const nextExpiry = detail?.asset?.expiresAt && detail.request.durationDays
    ? new Date(new Date(detail.asset.expiresAt).getTime() + detail.request.durationDays * 86400000)
    : null;
  const actionRequest = actionDialog ? items.find((item) => item.id === actionDialog.id) || (detail?.request.id === actionDialog.id ? detail.request : null) : null;
  const isReplacementApproval = actionDialog?.action === "approve" && actionRequest?.type === "replace";
  const replacementIncomplete = isReplacementApproval && (!replacementForm.host.trim() || !replacementForm.port || !replacementForm.country.trim() || !replacementForm.city.trim());

  return <div className="standalone-admin aftersales-center">
    <header><a href="/admin">← 返回后台</a><h1>售后申请</h1></header>
    {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
    <div className="standalone-table aftersales-table">
      <div className="orow head"><span>申请编号</span><span>客户</span><span>代理资产</span><span>类型</span><span>原因 / 时长</span><span>状态</span><span>操作</span></div>
      {items.length === 0 ? <div className="empty">暂无售后申请</div> : items.map((item) => <div className="orow" key={item.id}>
        <span><button className="aftersales-link mono" onClick={() => void open(item)}>{item.id}</button></span>
        <span><button className="aftersales-link" onClick={() => openCustomer(item.customerId)}>{item.customerName || "未设置名称"}</button>{item.customerEmail&&<small>{item.customerEmail}</small>}</span>
        <span><button className="aftersales-link mono" onClick={() => void open(item)}>{item.allocationId}</button></span>
        <span>{item.type === "renew" ? "续费" : item.type === "reset_traffic" ? "流量重置" : item.type === "custom" ? "一次性服务" : "更换"}</span>
        <span>{item.reason || `${item.durationDays || 0} 天`}</span>
        <span><b className={`aftersales-status ${item.status}`}>{statusLabels[item.status] || "未知状态"}</b></span>
        <span className="live-actions"><button onClick={() => void open(item)}>查看详情</button>{item.status === "pending" && <><button className="primary" onClick={() => askAction(item.id, "approve")}>批准</button><button className="danger-outline" onClick={() => askAction(item.id, "reject")}>拒绝</button></>}</span>
      </div>)}
    </div>
    {loading && <div className="customer-drawer-mask"><div className="customer-drawer loading">正在加载售后详情…</div></div>}
    {detail && <div className="aftersales-detail-mask" onClick={() => setDetail(null)}><section className="aftersales-detail" onClick={(event) => event.stopPropagation()}>
      <header><div><small>售后申请详情</small><h2>{detail.request.type === "renew" ? "代理续费" : detail.request.type === "reset_traffic" ? "节点流量重置" : detail.request.type === "custom" ? "一次性服务" : "代理更换"}</h2><p>{detail.request.id}</p></div><button onClick={() => setDetail(null)}>×</button></header>
      <div className="aftersales-detail-body">
        <section><h3>客户与申请</h3><div className="aftersales-detail-grid">
          <div><span>客户</span><button className="aftersales-link" onClick={() => openCustomer(detail.request.customerId)}>{detail.customer?.name || detail.customer?.email || displayCustomerId(detail.request.customerId)}</button></div>
          <div><span>联系邮箱</span><b>{detail.customer?.email || "未知"}</b></div>
          <div><span>申请时间</span><b>{date(detail.request.createdAt)}</b></div>
          <div><span>申请状态</span><b className={`aftersales-status ${detail.request.status}`}>{statusLabels[detail.request.status] || "未知状态"}</b></div>
        </div></section>
        <section><h3>{detail.request.type === "reset_traffic" ? "需要重置的节点服务" : detail.request.type === "custom" ? "本次服务对应的客户商品" : detail.request.type === "replace" ? "需要更换的代理资源" : "续费的代理资源"}</h3>{detail.request.type === "reset_traffic" || detail.request.type === "custom" ? (detail.nodeOrder ? <div className="aftersales-detail-grid"><div><span>关联订单</span><b className="mono">{detail.nodeOrder.id}</b></div><div><span>商品类型</span><b>{detail.nodeOrder.product}</b></div><div><span>服务范围</span><b>{detail.nodeOrder.region}</b></div><div><span>服务状态</span><b>{detail.nodeOrder.status}</b></div><div><span>当前到期时间</span><b>{date(detail.nodeOrder.expiresAt)}</b></div><div><span>服务费用</span><strong>¥{detail.request.amount?.toFixed(2) || "0.00"}</strong></div></div> : <div className="empty-inline">未找到对应客户服务</div>) : detail.asset ? <div className="aftersales-detail-grid">
          <div><span>代理地址</span><b className="mono">{detail.asset.host}:{detail.asset.port}</b></div>
          <div><span>账号</span><b>{detail.asset.username || "未设置"}</b></div>
          <div><span>产品 / 地区</span><b>{detail.asset.product} · {detail.asset.region}</b></div>
          <div><span>国家 / 城市</span><b>{detail.asset.country || detail.asset.region} / {detail.asset.city || "未设置"}</b></div>
          <div><span>协议</span><b>{detail.asset.protocol}</b></div>
          <div><span>原订单</span><b className="mono">{detail.asset.orderId}</b></div>
          <div><span>当前到期时间</span><b>{date(detail.asset.expiresAt)}</b></div>
          <div><span>资源状态</span><b>{detail.asset.status === "active" ? "使用中" : detail.asset.status}</b></div>
        </div> : <div className="empty-inline">未找到对应的代理资源，资源可能已删除。</div>}</section>
        {detail.request.type === "renew" && <section><h3>续费信息</h3><div className="aftersales-detail-grid renewal-focus">
          <div><span>续费时长</span><strong>{detail.request.durationDays || 0} 天</strong></div>
          <div><span>续费金额</span><strong>{detail.request.amount == null ? "待管理员核价" : `¥${detail.request.amount.toFixed(2)}`}</strong></div>
          <div><span>续费后到期时间</span><strong>{nextExpiry ? date(nextExpiry.toISOString()) : "需先设置当前到期时间"}</strong></div>
          <div><span>自动续费</span><strong>{detail.asset?.autoRenew ? "已开启" : "未开启"}</strong></div>
        </div></section>}
        {detail.request.type === "replace" && <section><h3>更换申请</h3><div className="aftersales-detail-grid renewal-focus"><div><span>已付费用</span><strong>¥{detail.request.amount?.toFixed(2) || "0.00"}</strong></div><div><span>更换原因</span><strong>{detail.request.reason || "未填写"}</strong></div></div></section>}
      </div>
      <footer><button onClick={() => setDetail(null)}>关闭</button>{detail.request.status === "pending" && <button className="danger-outline" onClick={() => askAction(detail.request.id, "reject")}>拒绝申请</button>}{(detail.request.status === "pending" || (detail.request.type === "reset_traffic" && detail.request.status === "completed")) && <button className="primary" onClick={() => askAction(detail.request.id, "approve")}>{detail.request.type === "reset_traffic" ? (detail.request.status === "completed" ? "重新执行流量重置" : "执行流量重置") : detail.request.type === "custom" ? "确认服务已完成" : detail.request.type === "replace" ? "确认并更换 IP" : "批准并执行续费"}</button>}</footer>
    </section></div>}
    {actionDialog&&<div className="aftersales-action-mask" onMouseDown={event=>{if(event.target===event.currentTarget&&!actionBusy)setActionDialog(null)}}><form className={`aftersales-action-dialog${isReplacementApproval ? " replacement-dialog" : ""}`} onSubmit={event=>{event.preventDefault();void action(actionDialog.id,actionDialog.action,actionNote)}}>
      <header><div><small>售后申请 {actionDialog.id}</small><h2>{actionDialog.action==="reject"?"拒绝售后申请":isReplacementApproval?"填写并交付新代理":"确认处理售后申请"}</h2></div><button type="button" disabled={actionBusy} onClick={()=>setActionDialog(null)}>×</button></header>
      {isReplacementApproval&&<section className="replacement-resource-form">
        <div className="replacement-resource-heading"><div><strong>新代理资源</strong><span>确认后将直接替换客户当前使用的代理信息</span></div><b>必填项标有 *</b></div>
        <div className="replacement-resource-grid">
          <label className="wide">代理地址 / IP *<input autoFocus required value={replacementForm.host} onChange={event=>setReplacementForm(value=>({...value,host:event.target.value}))} placeholder="例如 23.134.60.23"/></label>
          <label>端口 *<input type="number" min="1" max="65535" required value={replacementForm.port} onChange={event=>setReplacementForm(value=>({...value,port:event.target.value}))} placeholder="例如 443"/></label>
          <label>协议 *<select value={replacementForm.protocol} onChange={event=>setReplacementForm(value=>({...value,protocol:event.target.value}))}><option value="SOCKS5">SOCKS5</option><option value="HTTPS">HTTPS</option><option value="HTTP">HTTP</option></select></label>
          <label>账号<input value={replacementForm.username} onChange={event=>setReplacementForm(value=>({...value,username:event.target.value}))} placeholder="可留空"/></label>
          <label>密码<input value={replacementForm.password} onChange={event=>setReplacementForm(value=>({...value,password:event.target.value}))} placeholder="留空则保留原密码"/></label>
          <label>WiFi 名称<input value={replacementForm.wifiName} onChange={event=>setReplacementForm(value=>({...value,wifiName:event.target.value}))} placeholder="可留空"/></label>
          <label>国家代码 *<input required maxLength={2} value={replacementForm.country} onChange={event=>setReplacementForm(value=>({...value,country:event.target.value.toUpperCase()}))} placeholder="例如 US、JP"/></label>
          <label className="wide">城市 *<input required value={replacementForm.city} onChange={event=>setReplacementForm(value=>({...value,city:event.target.value}))} placeholder="例如 洛杉矶"/></label>
        </div>
      </section>}
      <label>{actionDialog.action==="reject"?"拒绝原因":"处理备注（可选）"}<textarea autoFocus rows={5} maxLength={500} required={actionDialog.action==="reject"} value={actionNote} onChange={event=>setActionNote(event.target.value)} placeholder={actionDialog.action==="reject"?"请填写明确的拒绝原因，客户可在售后记录中查看":"填写本次处理结果或内部说明"}/></label>
      <p>{actionDialog.action==="reject"?"拒绝后申请状态将变为“已拒绝”，原因会保存到售后记录。":isReplacementApproval?"提交后客户原代理将立即更新为上述资源，并同步完成售后申请。":"确认后系统将执行对应的售后处理，请核对服务信息。"}</p>
      <footer><button type="button" disabled={actionBusy} onClick={()=>setActionDialog(null)}>取消</button><button className={actionDialog.action==="reject"?"danger-outline":"primary"} disabled={actionBusy||(actionDialog.action==="reject"&&!actionNote.trim())||replacementIncomplete}>{actionBusy?"正在处理…":actionDialog.action==="reject"?"确认拒绝":isReplacementApproval?"确认更换并交付":"确认执行"}</button></footer>
    </form></div>}
  </div>;
}
