"use client";
import {useEffect} from "react";

type ProxyExpiry={host:string;port:number;expiresAt:string|null};

function formatMinute(value:string|null){
  if(!value)return "长期";
  return new Date(value).toLocaleString("zh-CN",{
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hour12:false,
  });
}

export default function DashboardExpiryEnhancer(){
  useEffect(()=>{
    if(!location.pathname.startsWith("/dashboard"))return;
    let items:ProxyExpiry[]=[];
    let stopped=false;
    const render=()=>{
      if(stopped||!items.length)return;
      document.querySelectorAll<HTMLElement>(".proxy-row:not(.head), .standalone-table .orow:not(.head)").forEach(row=>{
        const address=row.querySelector<HTMLElement>(".mono")?.dataset.address||row.querySelector<HTMLElement>(".mono")?.textContent?.trim();
        if(!address)return;
        const item=items.find(x=>`${x.host}:${x.port}`===address);
        if(!item)return;
        const expiry=row.querySelector(".proxy-expiry")||(row.classList.contains("proxy-row")?row.children[5]:row.children[4]);
        const formatted=formatMinute(item.expiresAt);
        if(expiry&&expiry.textContent!==formatted)expiry.textContent=formatted;
      });
    };
    fetch("/api/proxies").then(r=>r.json()).then(data=>{items=data.items||[];render()}).catch(()=>{});
    const observer=new MutationObserver(records=>{if(records.some(x=>x.addedNodes.length))render()});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{stopped=true;observer.disconnect()};
  },[]);
  return null;
}
