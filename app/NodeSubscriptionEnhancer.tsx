"use client";

import { useEffect, useState } from "react";

type OpenOrder = { id: string; currentUrl: string };

export default function NodeSubscriptionEnhancer() {
  const [open, setOpen] = useState<OpenOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function enhance() {
      const toolbar = document.querySelector<HTMLElement>(".order-workspace .order-toolbar");
      const product = document.querySelector<HTMLInputElement>('.order-workspace input[value="computer-node"]');
      const heading = document.querySelector<HTMLElement>(".order-workspace-head h2");
      if (!toolbar || !product || !heading || toolbar.querySelector(".subscription-delivery-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subscription-delivery-button";
      button.textContent = "发放订阅地址";
      button.onclick = async () => {
        const id = heading.textContent?.replace(/^.*?#/, "").trim() || "";
        button.disabled = true;
        try {
          const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "订单读取失败");
          const currentUrl = String(data.order.subscriptionUrl || "");
          setError("");
          setOpen({ id, currentUrl });
        } catch (cause) {
          alert(cause instanceof Error ? cause.message : "订单读取失败");
        } finally {
          button.disabled = false;
        }
      };
      toolbar.appendChild(button);
    }
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
    return () => observer.disconnect();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open || saving) return;
    setSaving(true);
    setError("");
    const subscriptionUrl = String(new FormData(event.currentTarget).get("subscriptionUrl") || "");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(open.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deliver-subscription", subscriptionUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发放失败");
      setOpen(null);
      location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发放失败");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return <div className="node-subscription-mask" onMouseDown={event => {
    if (event.target === event.currentTarget) setOpen(null);
  }}><form className="node-subscription-modal" onSubmit={save}>
    <header><div><small>电脑节点订单 {open.id}</small><h2>发放订阅地址</h2></div><button type="button" onClick={() => setOpen(null)}>×</button></header>
    {error && <div className="live-error">{error}</div>}
    <label>客户订阅地址<input name="subscriptionUrl" type="url" defaultValue={open.currentUrl} placeholder="https://example.com/subscription/..." required /></label>
    <p>发放后订单自动变为已开通，并从当前时间开始计算服务有效期。客户可以复制地址或扫码导入。</p>
    <footer><button type="button" className="secondary" onClick={() => setOpen(null)}>取消</button><button type="submit" className="primary subscription-submit" disabled={saving}>{saving ? "正在发放…" : "确认发放"}</button></footer>
  </form></div>;
}
