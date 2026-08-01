"use client";

import { useState } from "react";
import XPanelOrderBinding from "./XPanelOrderBinding";

export type AdminOrderDetail = {
  order: {
    id: string;
    customerEmail: string;
    product: string;
    region: string;
    quantity: number;
    amount: number;
    status: string;
    paymentReference: string | null;
    paymentMethod: string;
    expiresAt: string | null;
    renewalAmount: number | null;
    autoRenew: boolean;
    adminNote: string | null;
    createdAt: string;
  };
  customer: any;
  allocations: any[];
  payments: any[];
};

const labels: Record<string, string> = {
  pending: "待付款",
  paid: "已付款 / 可提取",
  provisioning: "等待人工开通",
  active: "已激活",
  refunded: "已退款",
  failed: "已取消",
};

const methods: Record<string, string> = {
  balance: "余额支付",
  manual: "人工确认",
  alipay: "支付宝",
  wechat: "微信支付",
  paypal: "PayPal",
  usdt: "USDT",
  bank: "银行转账",
};

export default function OrderDetailWorkspace({
  detail,
  onClose,
  onChanged,
}: {
  detail: AdminOrderDetail;
  onClose: () => void;
  onChanged?: (detail: AdminOrderDetail) => void | Promise<void>;
}) {
  const [current, setCurrent] = useState(detail);
  const [confirm, setConfirm] = useState<"cancel" | "refund" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const d = current;

  async function refresh() {
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(d.order.id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "订单详情读取失败");
    setCurrent(data);
    await onChanged?.(data);
  }

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(d.order.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionName, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "订单操作失败");
      setConfirm(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "订单操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("service-update", {
      paymentMethod: form.get("paymentMethod"),
      expiresAt: form.get("expiresAt"),
      renewalAmount: form.get("renewalAmount"),
      autoRenew: form.get("autoRenew") === "on",
      status: form.get("status"),
      adminNote: form.get("adminNote"),
    });
  }

  async function refund() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(d.order.id)}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "管理员审核退款工单后执行" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "退款失败");
      setConfirm(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退款失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order-workspace-mask customer-record-order-mask" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="order-workspace" onMouseDown={(event) => event.stopPropagation()}>
        <header className="order-workspace-head">
          <div>
            <span>订单管理 / {d.order.customerEmail}</span>
            <h2>订单 #{d.order.id}</h2>
          </div>
          <div>
            <b className={`order-status ${d.order.status}`}>{labels[d.order.status] || d.order.status}</b>
            <button type="button" onClick={onClose}>×</button>
          </div>
        </header>
        {error && <div className="live-error">{error}<button type="button" onClick={() => setError("")}>×</button></div>}
        <div className="order-toolbar">
          <button type="button">发送消息</button>
          <button type="button">创建工单</button>
          <button type="button" onClick={() => void action("fulfill")} disabled={busy || !["paid", "provisioning"].includes(d.order.status)}>从库存提取并发放</button>
        </div>
        <form className="mofang-order-form" onSubmit={(event) => void save(event)}>
          <section>
            <h3>产品与服务</h3>
            <div className="order-form-grid">
              <label>订单编号<input value={d.order.id} disabled /></label>
              <label>客户<input value={d.customer?.name || d.order.customerEmail} disabled /></label>
              <label>商品 / 服务<input value={d.order.product} disabled /></label>
              <label>地区额度<input value={`${d.order.region} × ${d.order.quantity} 条`} disabled /></label>
              <label>订购时间<input value={new Date(d.order.createdAt).toLocaleString("zh-CN", { hour12: false })} disabled /></label>
              <label>服务状态<select name="status" defaultValue={d.order.status}><option value="pending">待付款</option><option value="paid">已付款</option><option value="provisioning">等待人工开通</option><option value="active">已激活</option><option value="refunded">已退款</option><option value="failed">已取消</option></select></label>
            </div>
          </section>
          <section>
            <h3>财务与续费</h3>
            <div className="order-form-grid">
              <label>首付金额<input value={d.order.amount.toFixed(2)} disabled /></label>
              <label>付款方式<select name="paymentMethod" defaultValue={d.order.paymentMethod || "balance"}>{Object.entries(methods).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
              <label>到期时间<input name="expiresAt" type="datetime-local" defaultValue={d.order.expiresAt ? new Date(d.order.expiresAt).toISOString().slice(0, 16) : ""} /></label>
              <label>续费金额<input name="renewalAmount" type="number" min="0" step="0.01" defaultValue={d.order.renewalAmount ?? d.order.amount} /></label>
              <label className="renew-switch">余额自动续费<input name="autoRenew" type="checkbox" defaultChecked={d.order.autoRenew} /><i /></label>
              <label>支付流水<input value={d.order.paymentReference || "未支付"} disabled /></label>
            </div>
          </section>
          <section>
            <h3>管理员信息</h3>
            <label className="admin-note">管理员备注<textarea name="adminNote" rows={4} defaultValue={d.order.adminNote || ""} placeholder="仅管理员可见，可记录采购渠道、开通信息和客户约定" /></label>
          </section>
          {d.order.product === "computer-node" && <XPanelOrderBinding orderId={d.order.id} />}
          <section>
            <h3>已分配资源</h3>
            {d.allocations.length ? <div className="resource-table">{d.allocations.map((item) => <div key={item.id}><span className="mono">{item.host}:{item.port}</span><span className="resource-region"><b>{item.country || d.order.region}</b><small>{item.city || "未设置城市"}</small></span><span>{item.protocol}</span><span className="resource-expiry"><small>到期时间</small><b>{item.expiresAt ? new Date(item.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "未设置"}</b></span><span>{item.autoRenew ? "自动续费" : "手动续费"}</span></div>)}</div> : <p className="empty-inline">尚未分配真实 IP</p>}
          </section>
          <footer className="order-savebar">
            <div>
              {d.order.status === "pending" && <button type="button" onClick={() => setConfirm("cancel")}>取消订单</button>}
              {["paid", "provisioning", "active"].includes(d.order.status) && <button type="button" className="danger" onClick={() => setConfirm("refund")}>退款</button>}
            </div>
            <div>
              <button type="button" disabled={busy} onClick={() => void refresh()}>取消更改</button>
              <button className="primary" disabled={busy}>{busy ? "处理中…" : "保存更改"}</button>
            </div>
          </footer>
        </form>
        {confirm && <div className="inline-confirm floating"><b>{confirm === "cancel" ? "确认取消订单并恢复销售额度？" : "确认已核对退款工单，并退款到客户余额？"}</b><button type="button" onClick={() => setConfirm(null)}>返回</button><button type="button" className="danger" disabled={busy} onClick={() => void (confirm === "cancel" ? action("cancel") : refund())}>确认执行</button></div>}
      </section>
    </div>
  );
}
