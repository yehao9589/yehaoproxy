"use client";

import { useEffect } from "react";

export default function PaymentReturnEnhancer() {
  useEffect(() => {
    if (location.pathname !== "/dashboard") return;
    const raw = sessionStorage.getItem("yehao-payment-success");
    if (!raw) return;
    sessionStorage.removeItem("yehao-payment-success");
    let orderId = "";
    try {
      orderId = String(JSON.parse(raw)?.orderId || "");
    } catch {}
    const toast = document.createElement("div");
    toast.className = "payment-return-toast";
    toast.innerHTML = `<i>✓</i><div><b>支付成功</b><small>${orderId ? `订单 ${orderId} 已支付，服务状态已更新` : "订单已支付，服务状态已更新"}</small></div>`;
    document.body.appendChild(toast);
    const timer = window.setTimeout(() => {
      toast.classList.add("leaving");
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
    return () => {
      window.clearTimeout(timer);
      toast.remove();
    };
  }, []);
  return null;
}
