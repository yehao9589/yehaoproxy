"use client";

import { useEffect } from "react";

const statusLabels: Record<string, string> = {
  pending: "待付款",
  paid: "待人工提取",
  provisioning: "等待人工开通",
  active: "已提取",
  refunded: "已退款",
  failed: "已取消",
};

export default function OverviewStatusEnhancer() {
  useEffect(() => {
    function translate() {
      document
        .querySelectorAll<HTMLElement>(
          ".admin-shortcuts + .module .arow.order:not(.ahead) > span:nth-child(6)",
        )
        .forEach((cell) => {
          const value = cell.textContent?.trim().toLowerCase() || "";
          if (statusLabels[value]) cell.textContent = statusLabels[value];
        });
    }

    translate();
    const observer = new MutationObserver(translate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
