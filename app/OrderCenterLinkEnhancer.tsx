"use client";

import { useEffect } from "react";

export default function OrderCenterLinkEnhancer() {
  useEffect(() => {
    function clickAdminNav(label: string) {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".admin-pro aside nav button")]
        .find((item) => item.textContent?.includes(label));
      button?.click();
    }

    async function openCustomerByEmail(email: string) {
      const response = await fetch(`/api/admin/customers?size=5&search=${encodeURIComponent(email)}`);
      const data = await response.json();
      const customer = data.items?.find((item: { email: string }) => item.email === email) || data.items?.[0];
      if (!response.ok || !customer) return alert("客户档案不存在");
      clickAdminNav("客户管理");
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("yehao:open-customer", { detail: { id: customer.id } })), 260);
    }

    function openCustomerById(id: string) {
      clickAdminNav("客户管理");
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("yehao:open-customer", { detail: { id } })), 260);
    }

    function enhanceFilteredOrders() {
      document.querySelectorAll<HTMLElement>(".filtered-orders .arow.order:not(.ahead)").forEach((row) => {
        if (row.dataset.linksReady) return;
        row.dataset.linksReady = "1";
        const orderCell = row.children[0] as HTMLElement | undefined;
        const customerCell = row.children[1] as HTMLElement | undefined;
        const orderId = orderCell?.textContent?.trim() || "";
        const email = customerCell?.textContent?.trim() || "";
        if (orderCell && orderId) {
          orderCell.textContent = "";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "record-jump-link mono";
          button.textContent = orderId;
          button.onclick = () => {
            const all = [...document.querySelectorAll<HTMLButtonElement>(".order-center-tabs button")]
              .find((item) => item.textContent?.includes("全部订单"));
            all?.click();
            window.setTimeout(() => {
              const target = [...document.querySelectorAll<HTMLButtonElement>(".order-center-original .order-number-link")]
                .find((item) => item.textContent?.trim() === orderId);
              target?.click();
            }, 180);
          };
          orderCell.appendChild(button);
        }
        if (customerCell && email) {
          customerCell.textContent = "";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "record-jump-link";
          button.textContent = email;
          button.onclick = () => void openCustomerByEmail(email);
          customerCell.appendChild(button);
        }
      });
    }

    function enhanceRenewals() {
      document.querySelectorAll<HTMLElement>(".renewal-row:not(.head)").forEach((row) => {
        if (row.dataset.linksReady) return;
        row.dataset.linksReady = "1";
        const requestCell = row.children[0] as HTMLElement | undefined;
        const customerCell = row.children[1] as HTMLElement | undefined;
        const requestId = requestCell?.textContent?.trim() || "";
        const customerId = customerCell?.textContent?.trim() || "";
        if (requestCell && requestId) {
          requestCell.textContent = "";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "record-jump-link mono";
          button.textContent = requestId;
          button.title = "进入续费申请详情";
          button.onclick = () => clickAdminNav("售后申请");
          requestCell.appendChild(button);
        }
        if (customerCell && customerId) {
          customerCell.textContent = "";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "record-jump-link";
          button.textContent = customerId;
          button.onclick = () => openCustomerById(customerId);
          customerCell.appendChild(button);
          void fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`).then(async (response) => {
            if (!response.ok) return;
            const data = await response.json();
            button.textContent = data.customer?.name || data.customer?.email || customerId;
            button.title = data.customer?.email || "进入客户档案";
          });
        }
      });
    }

    function enhance() {
      enhanceFilteredOrders();
      enhanceRenewals();
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
