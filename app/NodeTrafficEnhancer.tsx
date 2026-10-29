"use client";

import { useEffect } from "react";

const gb = (value: number) => (Number(value || 0) / 1e9).toFixed(2);

export default function NodeTrafficEnhancer() {
  useEffect(() => {
    let stopped = false;

    async function load(host: HTMLElement, orderId: string, refresh = true) {
      host.className = "node-traffic-card loading";
      host.textContent = "正在同步服务流量…";
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/node-traffic${refresh ? "?refresh=1" : ""}`);
      const data = await response.json().catch(() => null);
      if (stopped || !host.isConnected) return;
      if (!response.ok || !data?.configured) {
        host.remove();
        return;
      }
      const traffic = data.traffic;
      if (!traffic) {
        host.className = "node-traffic-card empty";
        host.textContent = "服务流量尚未同步";
        return;
      }
      const limited = traffic.total > 0;
      const percent = limited ? Math.min(100, traffic.used / traffic.total * 100) : 0;
      host.className = "node-traffic-card";
      const size=gb;
      const unit="GB";
      host.innerHTML = `<div><span>本期服务流量</span><button type="button">刷新</button></div><b>${size(traffic.used)} ${unit} <small>${limited ? `/ ${size(traffic.total)} ${unit}` : "/ 不限量"}</small></b>${limited ? `<i><em style="width:${percent}%"></em></i><p>剩余 ${size(traffic.remaining)} ${unit} · 已用 ${percent.toFixed(1)}%</p>` : ""}`;
      if(traffic.pendingBaseline){const pending=document.createElement("p");pending.textContent="等待有效采样，原有用量已保留";host.appendChild(pending);}
      if(traffic.source==="komari"){const status=document.createElement("p");status.textContent=`${traffic.refreshFailed?"刷新暂未成功，显示上次记录":traffic.stale?"探针数据暂未更新":traffic.online?"在线":"离线"} · ${traffic.syncedAt?`更新于 ${new Date(traffic.syncedAt).toLocaleString("zh-CN")}`:"暂无采样"}`;host.appendChild(status);}
      host.querySelector("button")?.addEventListener("click", () => void load(host, orderId, true), { once: true });
    }

    function enhance() {
      const table = document.querySelector<HTMLElement>(".managed-node-table");
      const head = table?.querySelector<HTMLElement>(".orow.head");
      if (head && !head.querySelector(".node-traffic-heading")) {
        const heading = document.createElement("span");
        heading.className = "node-traffic-heading";
        heading.textContent = "流量使用";
        head.children[2]?.before(heading);
      }
      table?.querySelectorAll<HTMLElement>(".orow:not(.head)").forEach(row => {
        if (row.dataset.trafficEnhanced) return;
        const text = row.querySelector(".node-product-cell small")?.textContent || "";
        const orderId = row.dataset.orderId || text.match(/订单\s+([^\s·]+)/)?.[1];
        const expiryCell = row.querySelector<HTMLElement>(".node-expiry-column");
        if (!orderId || !expiryCell) return;
        row.dataset.trafficEnhanced = "1";
        const cell = document.createElement("span");
        cell.className = "node-traffic-cell";
        const host = document.createElement("div");
        cell.appendChild(host);
        expiryCell.before(cell);
        void load(host, orderId, true);
      });
    }

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
    return () => {
      stopped = true;
      observer.disconnect();
    };
  }, []);
  return null;
}
