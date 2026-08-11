"use client";

import {useEffect} from "react";

const productLabels:Record<string,string>={
  "static-isp":"静态住宅 IP", "static-residential":"静态住宅 IP",
  "dynamic-residential":"动态住宅代理", datacenter:"数据中心代理",
  "soft-router":"软路由中转", "computer-node":"电脑节点",
  "node-traffic-reset":"节点流量重置", "ip-replacement":"更换 IP 服务",
  "cart-bundle":"合并订单"
};
const statusLabels:Record<string,string>={pending:"待付款",paid:"待开通",provisioning:"待开通",active:"已开通",refunded:"已退款",failed:"已取消"};

function productText(value:string){
  const [product,detail=""]=value.split(" · ");
  const name=productLabels[product.trim()]||product.trim();
  const localized=detail.replace(/^MULTI\b/,"多个地区").replace(/^GLOBAL\b/,"全局节点");
  return localized?`${name} · ${localized}`:name;
}

export default function DashboardRecentOrdersEnhancer(){
  useEffect(()=>{
    const enhance=()=>{
      if(location.pathname!=="/dashboard")return;
      const card=[...document.querySelectorAll<HTMLElement>(".live-grid .proxy-panel")].find(item=>item.querySelector("h2")?.textContent?.trim()==="最近订单");
      if(!card)return;
      const title=card.querySelector<HTMLElement>(".panel-title");
      if(title&&!title.querySelector(".recent-orders-all")){const link=document.createElement("a");link.className="recent-orders-all";link.href="/dashboard?tab=orders";link.textContent="查看全部订单 →";title.append(link)}
      card.querySelectorAll<HTMLElement>(".live-orders>div").forEach(row=>{
        const number=row.querySelector<HTMLElement>("span b");
        if(number&&!number.querySelector("a")){const id=number.textContent?.trim();if(id){const link=document.createElement("a");link.href=`/dashboard?tab=orders&order=${encodeURIComponent(id)}`;link.textContent=id;link.title="查看订单详情";number.replaceChildren(link)}}
        const detail=row.querySelector<HTMLElement>("span small");
        if(detail){const next=productText(detail.textContent||"");if(detail.textContent!==next)detail.textContent=next}
        const status=row.querySelector<HTMLElement>("em"),key=status?.dataset.originalEnglish?.trim().toLowerCase()||status?.textContent?.trim().toLowerCase()||"";
        if(status&&statusLabels[key]){const label=statusLabels[key],className=`customer-order-status ${key}`;if(status.textContent!==label||status.className!==className){status.textContent=label;status.className=className}}
      });
    };
    const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true,characterData:true});enhance();return()=>observer.disconnect();
  },[]);
  return null;
}
