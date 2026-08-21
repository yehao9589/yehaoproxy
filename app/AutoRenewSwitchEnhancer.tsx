"use client";

import { useEffect } from "react";

type ServicePeriod = { host:string; port:number; durationDays:number; billingCycle?:"fixed-days"|"calendar-month"; availableRenewalPeriods?:number[] };

export default function AutoRenewSwitchEnhancer() {
  useEffect(() => {
    if (!location.pathname.startsWith("/dashboard")) return;
    const services = new Map<string, ServicePeriod>();

    function addressOf(cell: Element) {
      const row = cell.closest(".orow");
      return row?.querySelector<HTMLElement>(".mono")?.dataset.address || row?.querySelector<HTMLElement>(".mono")?.textContent?.trim() || "";
    }

    function enhance() {
      document.querySelectorAll<HTMLButtonElement>(".managed-proxy-table .proxy-auto-renew-cell > button").forEach((button) => {
        const text = button.textContent?.trim();
        if (text !== "自动续费" && text !== "关闭续费") return;
        const enabled = text === "关闭续费";
        const state = enabled ? "on" : "off";
        const cell = button.parentElement;
        if (!cell) return;
        const address = addressOf(cell);
        const service = services.get(address);

        if (button.dataset.switchState !== state) {
          button.dataset.switchState = state;
          button.className = `auto-renew-switch ${state}`;
          button.setAttribute("role", "switch");
          button.setAttribute("aria-checked", String(enabled));
          button.setAttribute("aria-label", `${enabled ? "关闭" : "开启"}自动续费`);
          button.title = enabled ? "点击关闭自动续费" : "点击开启自动续费";
          button.replaceChildren();
          const track = document.createElement("i"), label = document.createElement("span");
          track.appendChild(document.createElement("b"));
          label.textContent = enabled ? "已开启" : "未开启";
          button.append(track, label);
        }

        const oldSelect = cell.querySelector<HTMLSelectElement>("select");
        const small = cell.querySelector("small");
        if (!service && !small) return;
        const raw = small?.textContent || "";
        const natural = service ? service.billingCycle === "calendar-month" : raw.includes("自然月") || raw.includes("个月");
        const days = service?.durationDays || (natural ? Number(raw.match(/\d+/)?.[0] || 1) * 30 : Number(raw.match(/\d+/)?.[0] || 30));
        const signature = `${natural ? "month" : "day"}-${days}`;
        if (oldSelect?.dataset.periodSignature === signature) return;

        const select = oldSelect || document.createElement("select");
        select.dataset.periodSignature = signature;
        select.setAttribute("aria-label", "默认续费周期");
        const values = natural ? [30,60,90,180] : [...(service?.availableRenewalPeriods?.length ? service.availableRenewalPeriods : [7,30])];
        if (!values.includes(days)) values.push(days);
        select.replaceChildren(...values.sort((a,b)=>a-b).map(value => new Option(natural ? `${value / 30} 个月` : `${value} 天`, String(value), false, value === days)));
        select.value = String(days);
        select.onchange = async () => {
          const split = address.lastIndexOf(":"), host = address.slice(0,split), port = Number(address.slice(split+1));
          const durationDays = Number(select.value);
          select.disabled = true;
          const response = await fetch("/api/proxies/by-address", {method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({host,port,renewalDays:durationDays})});
          select.disabled = false;
          if (!response.ok) { const data=await response.json().catch(()=>({})); alert(data.error||"续费周期保存失败"); return; }
          services.set(address,{host,port,durationDays,billingCycle:natural?"calendar-month":"fixed-days"});
          window.dispatchEvent(new CustomEvent("yehao:renewal-days-updated",{detail:{host,port,durationDays}}));
        };
        if (!oldSelect) small?.replaceWith(select);
      });
    }

    fetch("/api/proxies").then(response=>response.ok?response.json():null).then(data=>{
      for(const item of data?.items||[])services.set(`${item.host}:${item.port}`,item);
      enhance();
    }).catch(()=>{});
    const observer = new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length||record.removedNodes.length))enhance()});
    observer.observe(document.body,{childList:true,subtree:true});
    enhance();
    return()=>observer.disconnect();
  },[]);
  return null;
}
