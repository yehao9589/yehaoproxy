"use client";

import { useEffect, useState } from "react";
import OrderDetailWorkspace, { type AdminOrderDetail } from "./OrderDetailWorkspace";

type Order = AdminOrderDetail["order"] & { currency: string; durationDays: number; updatedAt: string };

const labels: Record<string, string> = {
  pending: "待付款",
  paid: "已付款 / 可提取",
  provisioning: "等待人工开通",
  active: "已激活",
  refunded: "已退款",
  failed: "已取消",
};

export default function OrderManager() {
  const [rows, setRows] = useState<Order[]>([]);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/orders?size=100");
    const data = await response.json();
    response.ok ? setRows(data.items) : setError(data.error);
  }

  useEffect(() => { void load(); }, []);

  async function open(id: string) {
    setBusy(true);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`);
    const data = await response.json();
    setBusy(false);
    response.ok ? setDetail(data) : setError(data.error);
  }

  return (
    <div className="module order-manager">
      <div className="module-toolbar">
        <div>
          <button className="on">全部订单 {rows.length}</button>
          <button>待付款 {rows.filter((item) => item.status === "pending").length}</button>
          <button>待开通 {rows.filter((item) => ["paid", "provisioning"].includes(item.status)).length}</button>
        </div>
        <button onClick={() => void load()}>刷新订单</button>
      </div>
      {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
      <div className="admin-table">
        <div className="arow order ahead"><span>订单号</span><span>客户</span><span>商品 / 地区</span><span>金额</span><span>到期时间</span><span>状态</span><span>操作</span></div>
        {rows.map((order) => <div className="arow order" key={order.id}>
          <span><button className="order-number-link" onClick={() => void open(order.id)}>{order.id}</button></span>
          <span>{order.customerEmail}</span>
          <span>{order.product} · {order.region} × {order.quantity}</span>
          <span>${order.amount.toFixed(2)}</span>
          <span>{order.expiresAt ? new Date(order.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "未设置"}</span>
          <span><b className={`order-status ${order.status}`}>{labels[order.status] || order.status}</b></span>
          <span className="live-actions"><button onClick={() => void open(order.id)}>管理</button>{["paid", "provisioning"].includes(order.status) && <button className="primary" onClick={() => void open(order.id)}>开通</button>}</span>
        </div>)}
      </div>
      {busy && <div className="customer-drawer-mask"><div className="customer-drawer loading">正在加载订单配置…</div></div>}
      {detail && <OrderDetailWorkspace detail={detail} onClose={() => setDetail(null)} onChanged={async (next) => { setDetail(next); await load(); }} />}
    </div>
  );
}
