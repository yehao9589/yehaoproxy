"use client";
import {useEffect} from "react";

type ProxyExpiry={id:string;host:string;port:number;expiresAt:string|null};

function formatMinute(value:string|null){
  if(!value)return "长期";
  return new Date(value).toLocaleString("zh-CN",{
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hour12:false,
  });
}

function renderMinute(target:Element,value:string|null){
  if(!value){target.textContent="长期";(target as HTMLElement).dataset.expiryValue="长期";return}
  const text=formatMinute(value),parts=text.split(/\s+/),date=document.createElement("span"),time=document.createElement("span");
  date.textContent=parts[0]||text;time.textContent=parts.slice(1).join(" ")||"00:00";
  target.replaceChildren(date,time);(target as HTMLElement).dataset.expiryValue=value;
}

export default function DashboardExpiryEnhancer(){
  useEffect(()=>{
    if(!location.pathname.startsWith("/dashboard"))return;
    let items:ProxyExpiry[]=[];
    let stopped=false;
    const render=()=>{
      if(stopped||!items.length)return;
      document.querySelectorAll<HTMLElement>(".proxy-row:not(.head), .standalone-table .orow:not(.head)").forEach(row=>{
        const allocationId=row.dataset.allocationId;
        const address=row.querySelector<HTMLElement>(".mono")?.dataset.address||row.querySelector<HTMLElement>(".mono")?.textContent?.trim();
        const item=allocationId?items.find(x=>x.id===allocationId):address?items.find(x=>`${x.host}:${x.port}`===address):null;
        if(!item)return;
        const expiry=row.querySelector(".proxy-expiry")||(row.classList.contains("proxy-row")?row.children[5]:row.children[4]);
        if(expiry&&(expiry as HTMLElement).dataset.expiryValue!==(item.expiresAt||"长期"))renderMinute(expiry,item.expiresAt);
      });
    };
    fetch("/api/proxies").then(r=>r.json()).then(data=>{items=data.items||[];render()}).catch(()=>{});
    const observer=new MutationObserver(records=>{if(records.some(x=>x.addedNodes.length))render()});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{stopped=true;observer.disconnect()};
  },[]);
  return null;
}
