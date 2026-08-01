"use client";

import { useEffect } from "react";

type RequestItem = {
  id: string;
  allocationId: string;
  type: "renew" | "replace" | "reset_traffic" | "custom";
  status: "pending" | "approved" | "completed" | "rejected" | "cancelled";
  updatedAt: string;
};

const typeNames: Record<RequestItem["type"], string> = {
  renew: "续费",
  replace: "更换 IP",
  reset_traffic: "重置流量",
  custom: "附加服务",
};

const statusNames: Record<RequestItem["status"], string> = {
  pending: "等待处理",
  approved: "处理中",
  completed: "已完成",
  rejected: "已拒绝",
  cancelled: "已取消",
};

export default function AddonServiceStatusEnhancer() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let renderObserver: MutationObserver | undefined;

    async function sync() {
      if (!location.pathname.startsWith("/dashboard")) return;
      const [proxyResponse, requestResponse] = await Promise.all([
        fetch("/api/proxies?reveal=1"),
        fetch("/api/service-requests"),
      ]);
      const [proxyData, requestData] = await Promise.all([
        proxyResponse.json().catch(() => null),
        requestResponse.json().catch(() => null),
      ]);
      if (stopped || !proxyResponse.ok || !requestResponse.ok) return;

      const latest = new Map<string, RequestItem>();
      for (const item of (requestData?.items || []) as RequestItem[]) {
        if (!latest.has(item.allocationId)) latest.set(item.allocationId, item);
      }

      document.querySelectorAll(".addon-service-state").forEach(node => node.remove());

      const proxyRows = [...document.querySelectorAll<HTMLElement>(".managed-proxy-table .orow:not(.head)")];
      const proxies = proxyData?.items || [];
      proxyRows.forEach((row, index) => {
        const request = latest.get(String(proxies[index]?.id || ""));
        const expiry = row.querySelector<HTMLElement>(".proxy-expiry");
        if (request && expiry) expiry.appendChild(createBadge(request));
      });

      document.querySelectorAll<HTMLElement>(".managed-node-table .orow:not(.head)").forEach(row => {
        const text = row.querySelector(".node-product-cell small")?.textContent || "";
        const orderId = text.match(/订单\s+([^\s·]+)/)?.[1];
        const request = orderId ? latest.get(orderId) : undefined;
        const statusCell = row.querySelector<HTMLElement>(".node-service-actions")?.previousElementSibling as HTMLElement | undefined;
        if (request && statusCell) statusCell.appendChild(createBadge(request));
      });
    }

    function createBadge(item: RequestItem) {
      const badge = document.createElement("small");
      badge.className = `addon-service-state ${item.status}`;
      badge.textContent = `${typeNames[item.type]} · ${statusNames[item.status]}`;
      badge.title = `售后单 ${item.id}`;
      return badge;
    }

    renderObserver = new MutationObserver(() => {
      const serviceRow = document.querySelector(".managed-proxy-table .orow:not(.head), .managed-node-table .orow:not(.head)");
      if (!serviceRow) return;
      renderObserver?.disconnect();
      void sync();
    });
    renderObserver.observe(document.body, { childList: true, subtree: true });
    void sync();
    timer = setInterval(() => void sync(), 15000);
    const refresh = () => void sync();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      renderObserver?.disconnect();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return null;
}
