"use client";

import { useEffect } from "react";

const gb = (value: number) => (Number(value || 0) / 1073741824).toFixed(2);

export default function NodeTrafficEnhancer() {
  useEffect(() => {
    let stopped = false;

    async function load(host: HTMLElement, orderId: string, refresh = true) {
      host.className = "node-traffic-card loading";
      host.textContent = "正在同步 VPS 流量…";
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
        host.textContent = "VPS 流量尚未同步";
        return;
      }
      const limited = traffic.total > 0;
      const percent = limited ? Math.min(100, traffic.used / traffic.total * 100) : 0;
      host.className = "node-traffic-card";
      host.innerHTML = `<div><span>VPS 实时总流量</span><button type="button">刷新</button></div><b>${gb(traffic.used)} GB <small>${limited ? `/ ${gb(traffic.total)} GB` : "/ 不限量"}</small></b>${limited ? `<i><em style="width:${percent}%"></em></i>` : ""}<p>${limited ? `剩余 ${gb(traffic.remaining)} GB · 已用 ${percent.toFixed(1)}%` : `全部 ${Number(traffic.inboundCount || 0)} 个入站流量合计`}</p>`;
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
        const orderId = text.match(/订单\s+([^\s·]+)/)?.[1];
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
