"use client";

import { useEffect } from "react";

function displayId(id: string) {
  const match = String(id || "").match(/^local-user-(\d+)$/i);
  return match ? `user-${match[1]}` : String(id || "").replace(/^local-user-?/i, "user-");
}

export default function CustomerIdFormatEnhancer() {
  useEffect(() => {
    let timer = 0;
    let formatting = false;

    async function format() {
      if (formatting) return;
      const drawer = document.querySelector<HTMLElement>(".customer-drawer.customer-full");
      if (!drawer) return;
      const profile = drawer.querySelector<HTMLElement>(".customer-profile p");
      const email = profile?.textContent?.split(/·|路/)[0]?.trim();
      if (!email) return;

      formatting = true;
      try {
        let id = drawer.dataset.customerId;
        if (!id) {
          const response = await fetch(`/api/admin/customers?size=5&search=${encodeURIComponent(email)}`);
          const data = await response.json();
          const customer = data.items?.find((item: any) => item.email === email) || data.items?.[0];
          if (!response.ok || !customer) return;
          id = customer.id;
          drawer.dataset.customerId = id;
        }

        const number = displayId(id);
        const headerText = `${email} · 客户编号 ${number}`;
        if (profile && profile.textContent !== headerText) profile.textContent = headerText;

        drawer.querySelectorAll<HTMLElement>(".record-summary-grid dl > div, .profile-card dl > div").forEach((row) => {
          if (row.querySelector("dt")?.textContent?.trim() !== "客户编号") return;
          const value = row.querySelector<HTMLElement>("dd");
          if (value && value.textContent !== number) value.textContent = number;
        });
      } finally {
        formatting = false;
      }
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void format(), 0);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", schedule, true);
    window.addEventListener("yehao:open-customer", schedule);
    schedule();

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("yehao:open-customer", schedule);
    };
  }, []);

  return null;
}
