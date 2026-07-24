"use client";

import {useEffect} from "react";

export default function DashboardRecentOrdersEnhancer() {
  useEffect(() => {
    function enhance() {
      if (location.pathname !== "/dashboard") return;
      const cards = [...document.querySelectorAll<HTMLElement>(".live-grid .proxy-panel")];
      const card = cards.find(item => item.querySelector("h2")?.textContent?.trim() === "最近订单");
      if (!card) return;
      const title = card.querySelector<HTMLElement>(".panel-title");
      if (title && !title.querySelector(".recent-orders-all")) {
        const link = document.createElement("a");
        link.className = "recent-orders-all";
        link.href = "/dashboard/orders";
        link.textContent = "查看全部订单 →";
        title.appendChild(link);
      }
      card.querySelectorAll<HTMLElement>(".live-orders>div").forEach(row => {
        const number = row.querySelector<HTMLElement>("span b");
        if (!number || number.querySelector("a")) return;
        const id = number.textContent?.trim();
        if (!id) return;
        const link = document.createElement("a");
        link.href = `/dashboard/orders?order=${encodeURIComponent(id)}`;
        link.textContent = id;
        link.title = "查看订单详情";
        number.textContent = "";
        number.appendChild(link);
      });
    }
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, {childList: true, subtree: true});
    enhance();
    return () => observer.disconnect();
  }, []);
  return null;
}
