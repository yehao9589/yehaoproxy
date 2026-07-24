"use client";

import { useEffect } from "react";

type Eligibility = { host: string; port: number; replaceEligible: boolean; replaceEligibleUntil: string | null };

export default function ProxyReplaceEnhancer() {
  useEffect(() => {
    let eligibility = new Map<string, Eligibility>();
    let stopped = false;

    function enhance() {
      document.querySelectorAll<HTMLElement>(".managed-proxy-table .orow:not(.head)").forEach((row) => {
        const address = row.querySelector<HTMLElement>(".proxy-copy-value[data-address]")?.dataset.address;
        const actions = row.querySelector<HTMLElement>(".proxy-row-actions");
        if (!address || !actions) return;
        const buttons = [...actions.querySelectorAll<HTMLButtonElement>("button")];
        if (buttons.length < 4) return;
        if (buttons[0].textContent !== "使用") buttons[0].textContent = "使用";
        if (buttons[1].textContent !== "编辑") buttons[1].textContent = "编辑";
        if (buttons[2].textContent !== "更换") buttons[2].textContent = "更换";
        if (buttons[3].textContent !== "续费") buttons[3].textContent = "续费";
        const item = eligibility.get(address);
        if (!item) return;
        buttons[2].disabled = false;
        buttons[2].classList.remove("replace-expired");
        buttons[2].title = item.replaceEligible
          ? `提取后 3 天内可申请更换，截止 ${new Date(item.replaceEligibleUntil!).toLocaleString("zh-CN", { hour12: false })}`
          : "已超过免费期，可按后台设置的价格付费更换";
      });
    }

    void fetch("/api/proxies").then(async (response) => {
      if (!response.ok || stopped) return;
      const data = await response.json();
      eligibility = new Map((data.items || []).map((item: Eligibility) => [`${item.host}:${item.port}`, item]));
      enhance();
    });

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { stopped = true; observer.disconnect(); };
  }, []);
  return null;
}
