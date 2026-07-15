"use client";

import { useEffect } from "react";

type Customer = { id: string; email: string };

export default function CreditEnhancer() {
  useEffect(() => {
    let stopped = false;
    let working = false;

    async function enhance() {
      const actions = document.querySelector<HTMLElement>(".customer-drawer .profile-header-actions");
      if (!actions || actions.dataset.creditEnhanced || working) return;

      const email = document.querySelector<HTMLElement>(".customer-drawer .customer-profile p")
        ?.textContent?.split("·")[0].trim();
      if (!email) return;

      working = true;
      actions.dataset.creditEnhanced = "loading";
      try {
        const response = await fetch(`/api/admin/customers?size=100&search=${encodeURIComponent(email)}`);
        if (!response.ok || stopped) throw new Error("无法读取客户信息");
        const list = await response.json();
        const customer = list.items?.find((item: Customer) => item.email === email) as Customer | undefined;
        if (!customer) throw new Error("未找到客户");

        const button = document.createElement("button");
        button.className = "credit-admin-button";
        button.textContent = "设置信用额度";
        button.onclick = async () => {
          const detailResponse = await fetch(`/api/admin/customers/${customer.id}`);
          const detail = await detailResponse.json();
          if (!detailResponse.ok) return;

          const overlay = document.createElement("div");
          overlay.className = "credit-modal-overlay";
          overlay.innerHTML = `<div class="credit-modal" role="dialog" aria-modal="true">
            <h3>设置信用额度</h3>
            <p>已使用 $${Number(detail.summary.creditUsed || 0).toFixed(2)}，可用 $${Number(detail.summary.availableCredit || 0).toFixed(2)}</p>
            <label>信用额度（USD）<input type="number" min="0" max="1000000" step="0.01" value="${Number(detail.summary.creditLimit || 0).toFixed(2)}"></label>
            <div class="credit-modal-actions"><button type="button" data-cancel>取消</button><button type="button" data-save>保存</button></div>
            <div class="credit-modal-error"></div>
          </div>`;
          document.body.appendChild(overlay);
          const input = overlay.querySelector<HTMLInputElement>("input")!;
          const error = overlay.querySelector<HTMLElement>(".credit-modal-error")!;
          overlay.querySelector<HTMLElement>("[data-cancel]")!.onclick = () => overlay.remove();
          overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
          overlay.querySelector<HTMLButtonElement>("[data-save]")!.onclick = async (event) => {
            const save = event.currentTarget as HTMLButtonElement;
            save.disabled = true;
            error.textContent = "";
            const response = await fetch(`/api/admin/customers/${customer.id}/credit`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ creditLimit: Number(input.value) }),
            });
            const data = await response.json();
            if (!response.ok) {
              error.textContent = data.error || "保存失败";
              save.disabled = false;
              return;
            }
            button.textContent = `信用额度 $${Number(data.creditLimit).toFixed(2)}`;
            overlay.remove();
          };
          input.focus();
        };
        actions.insertBefore(button, actions.firstChild);
        actions.dataset.creditEnhanced = "done";
      } catch {
        delete actions.dataset.creditEnhanced;
      } finally {
        working = false;
      }
    }

    const observer = new MutationObserver(() => void enhance());
    observer.observe(document.body, { childList: true, subtree: true });
    void enhance();
    return () => { stopped = true; observer.disconnect(); };
  }, []);

  return null;
}
