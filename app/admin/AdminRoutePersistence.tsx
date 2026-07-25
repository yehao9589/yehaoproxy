"use client";
import { useEffect } from "react";

const tabs: Record<string,string> = {
  overview:"运营概览",
  orders:"订单管理",
  products:"商品管理",
  inventory:"库存中心",
  customers:"客户管理",
  finance:"财务中心",
  sales:"销售业绩",
  tickets:"工单管理",
  coupons:"优惠券",
  requests:"售后申请",
  automation:"定时任务",
  updates:"在线更新",
  "settings-site":"站务管理",
  "settings-general":"基础设置",
  "settings-service":"服务策略",
  "settings-notifications":"通知中心",
  "settings-suppliers":"供应商",
  "settings-payments":"支付渠道",
  "settings-security":"安全策略",
  "settings-admins":"管理员账户",
  audit:"审计日志",
};

function buttonFor(tab:string){
  const label=tabs[tab];
  if(!label)return null;
  return document.querySelector<HTMLButtonElement>(`.admin-pro > aside nav button[data-tab="${tab}"]`)
    ||[...document.querySelectorAll<HTMLButtonElement>(".admin-pro > aside nav button[data-tab]")]
      .find(button=>button.textContent?.includes(label))||null;
}

export default function AdminRoutePersistence(){
  useEffect(()=>{
    function restore(){
      const requested=new URL(location.href).searchParams.get("tab")||"overview";
      const tab=requested==="settings"?"settings-general":requested;
      const button=buttonFor(tab);
      if(button&&!button.classList.contains("on"))button.click();
    }
    function remember(){
      requestAnimationFrame(()=>{
        const button=document.querySelector<HTMLButtonElement>(".admin-pro > aside nav button[data-tab].on");
        const tab=button?.dataset.tab||Object.entries(tabs).find(([,label])=>button?.textContent?.includes(label))?.[0];
        if(!tab)return;
        const url=new URL(location.href);
        if(tab==="overview")url.searchParams.delete("tab");else url.searchParams.set("tab",tab);
        history.replaceState(history.state,"",url);
      });
    }
    requestAnimationFrame(restore);
    document.addEventListener("click",remember);
    window.addEventListener("popstate",restore);
    return()=>{document.removeEventListener("click",remember);window.removeEventListener("popstate",restore)};
  },[]);
  return null;
}
