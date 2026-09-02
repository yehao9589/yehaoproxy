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

        const initialDetailResponse = await fetch(`/api/admin/customers/${customer.id}`);
        const initialDetail = await initialDetailResponse.json();
        if (!initialDetailResponse.ok) throw new Error("无法读取信用数据");
        const summary = initialDetail.summary || {};
        const profileHeader = actions.closest("header");
        if (profileHeader && !profileHeader.parentElement?.querySelector(".customer-credit-summary")) {
          const panel = document.createElement("section");
          panel.className = "customer-credit-summary";
          panel.innerHTML = `<div><span>信用额度</span><b data-credit-limit>¥${Number(summary.creditLimit||0).toFixed(2)}</b></div><div><span>已使用</span><b>¥${Number(summary.creditUsed||0).toFixed(2)}</b></div><div><span>可用额度</span><b>¥${Number(summary.availableCredit||0).toFixed(2)}</b></div><div><span>账单日 / 还款日</span><b>每月 ${Number(summary.billDay||1)} 日 / ${Number(summary.repaymentDay||10)} 日</b></div><div><span>信用状态</span><b class="${summary.creditStatus||"active"}">${summary.creditStatus==="frozen"?"已停用":summary.creditStatus==="overdue"?"已逾期":"正常"}</b></div>`;
          profileHeader.insertAdjacentElement("afterend", panel);
        }

        const button = document.createElement("button");
        button.className = "credit-admin-button";
        button.textContent = `信用额度 ¥${Number(summary.creditLimit||0).toFixed(2)}`;
        button.onclick = async () => {
          const detailResponse = await fetch(`/api/admin/customers/${customer.id}`);
          const detail = await detailResponse.json();
          if (!detailResponse.ok) return;

          const overlay = document.createElement("div");
          overlay.className = "credit-modal-overlay";
          overlay.innerHTML = `<div class="credit-modal" role="dialog" aria-modal="true">
            <h3>信用额与账期设置</h3>
            <p>已使用 ¥${Number(detail.summary.creditUsed || 0).toFixed(2)}，可用 ¥${Number(detail.summary.availableCredit || 0).toFixed(2)}</p>
            <div class="credit-modal-grid">
              <label>信用额度（人民币）<input data-limit type="number" min="0" max="1000000" step="0.01" value="${Number(detail.summary.creditLimit || 0).toFixed(2)}"></label>
              <label>每月账单日<select data-bill-day>${Array.from({length:28},(_,i)=>i+1).map(x=>`<option value="${x}" ${Number(detail.summary.billDay||1)===x?"selected":""}>每月 ${x} 日</option>`).join("")}</select></label>
              <label>每月还款日<select data-repayment-day>${Array.from({length:28},(_,i)=>i+1).map(x=>`<option value="${x}" ${Number(detail.summary.repaymentDay||10)===x?"selected":""}>每月 ${x} 日</option>`).join("")}</select></label>
              <label>逾期宽限期<select data-grace>${[0,1,2,3,7,15].map(x=>`<option value="${x}" ${Number(detail.summary.graceDays||2)===x?"selected":""}>${x} 天</option>`).join("")}</select></label>
              <label>信用功能状态<select data-status><option value="active" ${detail.summary.creditStatus!=="frozen"?"selected":""}>正常使用</option><option value="frozen" ${detail.summary.creditStatus==="frozen"?"selected":""}>手动冻结</option></select></label>
            </div>
            <small class="credit-modal-hint">同一账期内的信用消费会合并为月度账单；到还款日未还即逾期，超过宽限期后冻结信用支付和自动续费。</small>
            <div class="credit-modal-actions"><button type="button" data-cancel>取消</button><button type="button" data-save>保存</button></div>
            <div class="credit-modal-error"></div>
          </div>`;
          document.body.appendChild(overlay);
          const input = overlay.querySelector<HTMLInputElement>("[data-limit]")!;
          const error = overlay.querySelector<HTMLElement>(".credit-modal-error")!;
          overlay.querySelector<HTMLElement>("[data-cancel]")!.onclick = () => overlay.remove();
          let pressedOnOverlay = false;
          overlay.onpointerdown = (event) => { pressedOnOverlay = event.target === overlay; };
          overlay.onpointerup = (event) => {
            if (pressedOnOverlay && event.target === overlay) overlay.remove();
            pressedOnOverlay = false;
          };
          overlay.onpointercancel = () => { pressedOnOverlay = false; };
          overlay.querySelector<HTMLButtonElement>("[data-save]")!.onclick = async (event) => {
            const save = event.currentTarget as HTMLButtonElement;
            save.disabled = true;
            error.textContent = "";
            const response = await fetch(`/api/admin/customers/${customer.id}/credit`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({creditLimit:Number(input.value),billDay:Number(overlay.querySelector<HTMLSelectElement>("[data-bill-day]")!.value),repaymentDay:Number(overlay.querySelector<HTMLSelectElement>("[data-repayment-day]")!.value),graceDays:Number(overlay.querySelector<HTMLSelectElement>("[data-grace]")!.value),status:overlay.querySelector<HTMLSelectElement>("[data-status]")!.value}),
            });
            const data = await response.json();
            if (!response.ok) {
              error.textContent = data.error || "保存失败";
              save.disabled = false;
              return;
            }
            button.textContent = `信用额度 ¥${Number(data.creditLimit).toFixed(2)}`;
            const limitText=document.querySelector<HTMLElement>(".customer-drawer .customer-credit-summary [data-credit-limit]");
            if(limitText)limitText.textContent=`¥${Number(data.creditLimit).toFixed(2)}`;
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
