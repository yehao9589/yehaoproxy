"use client";

import { useEffect, useState } from "react";

type RequestItem = {
  id: string;
  customerId: string;
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

  async function action(id: string, actionName: string) {
    const note = window.prompt(actionName === "approve" ? "处理备注（可选）" : "请填写拒绝原因") || "";
    const response = await fetch(`/api/admin/service-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: actionName, note }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "处理失败");
    setDetail(null);
    await load();
  }

  const nextExpiry = detail?.asset?.expiresAt && detail.request.durationDays
    ? new Date(new Date(detail.asset.expiresAt).getTime() + detail.request.durationDays * 86400000)
    : null;

  return <div className="standalone-admin aftersales-center">
    <header><a href="/admin">← 返回后台</a><h1>售后申请</h1></header>
    {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
    <div className="standalone-table aftersales-table">
      <div className="orow head"><span>申请编号</span><span>客户</span><span>代理资产</span><span>类型</span><span>原因 / 时长</span><span>状态</span><span>操作</span></div>
      {items.length === 0 ? <div className="empty">暂无售后申请</div> : items.map((item) => <div className="orow" key={item.id}>
        <span><button className="aftersales-link mono" onClick={() => void open(item)}>{item.id}</button></span>
        <span><button className="aftersales-link" onClick={() => openCustomer(item.customerId)}>{item.customerId}</button></span>
        <span><button className="aftersales-link mono" onClick={() => void open(item)}>{item.allocationId}</button></span>
        <span>{item.type === "renew" ? "续费" : item.type === "reset_traffic" ? "流量重置" : item.type === "custom" ? "一次性服务" : "更换"}</span>
        <span>{item.reason || `${item.durationDays || 0} 天`}</span>
        <span><b className={`aftersales-status ${item.status}`}>{statusLabels[item.status] || "未知状态"}</b></span>
        <span className="live-actions"><button onClick={() => void open(item)}>查看详情</button>{item.status === "pending" && <><button className="primary" onClick={() => void action(item.id, "approve")}>批准</button><button className="danger-outline" onClick={() => void action(item.id, "reject")}>拒绝</button></>}</span>
      </div>)}
    </div>
    {loading && <div className="customer-drawer-mask"><div className="customer-drawer loading">正在加载售后详情…</div></div>}
    {detail && <div className="aftersales-detail-mask" onClick={() => setDetail(null)}><section className="aftersales-detail" onClick={(event) => event.stopPropagation()}>
      <header><div><small>售后申请详情</small><h2>{detail.request.type === "renew" ? "代理续费" : detail.request.type === "reset_traffic" ? "节点流量重置" : detail.request.type === "custom" ? "一次性服务" : "代理更换"}</h2><p>{detail.request.id}</p></div><button onClick={() => setDetail(null)}>×</button></header>
      <div className="aftersales-detail-body">
        <section><h3>客户与申请</h3><div className="aftersales-detail-grid">
          <div><span>客户</span><button className="aftersales-link" onClick={() => openCustomer(detail.request.customerId)}>{detail.customer?.name || detail.customer?.email || detail.request.customerId}</button></div>
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
      <footer><button onClick={() => setDetail(null)}>关闭</button>{detail.request.status === "pending" && <><button className="danger-outline" onClick={() => void action(detail.request.id, "reject")}>拒绝申请</button><button className="primary" onClick={() => void action(detail.request.id, "approve")}>{detail.request.type === "reset_traffic" ? "确认已重置流量" : detail.request.type === "custom" ? "确认服务已完成" : detail.request.type === "replace" ? "确认并更换 IP" : "批准并执行续费"}</button></>}</footer>
    </section></div>}
  </div>;
}
