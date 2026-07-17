"use client";
import {useEffect} from "react";

export default function AutoRenewSwitchEnhancer(){
  useEffect(()=>{
    if(!location.pathname.startsWith("/dashboard"))return;
    function enhance(){
      document.querySelectorAll<HTMLButtonElement>(".managed-proxy-table .proxy-auto-renew-cell>button").forEach(button=>{
        const text=button.textContent?.trim();
        if(text!=="自动续费"&&text!=="关闭续费")return;
        const enabled=text==="关闭续费",state=enabled?"on":"off";
        if(button.dataset.switchState===state)return;
        button.dataset.switchState=state;
        button.className=`auto-renew-switch ${state}`;
        button.setAttribute("role","switch");
        button.setAttribute("aria-checked",String(enabled));
        button.setAttribute("aria-label",`${enabled?"关闭":"开启"}自动续费`);
        button.title=enabled?"点击关闭自动续费":"点击开启自动续费";
        button.replaceChildren();
        const track=document.createElement("i"),label=document.createElement("span");
        track.appendChild(document.createElement("b"));
        label.textContent=enabled?"已开启":"未开启";
        button.append(track,label);
        const cell=button.parentElement,small=cell?.querySelector("small");
        if(cell&&small&&!cell.querySelector("select")){
          const days=Number(small.textContent?.match(/\d+/)?.[0]||30),select=document.createElement("select");
          select.setAttribute("aria-label","默认续费时长");
          [7,30,90].forEach(value=>{const option=document.createElement("option");option.value=String(value);option.textContent=`${value} 天`;option.selected=value===days;select.appendChild(option)});
          select.onchange=async()=>{const row=cell.closest(".orow"),address=row?.querySelector<HTMLElement>(".mono")?.dataset.address||row?.querySelector<HTMLElement>(".mono")?.textContent?.trim()||"",split=address.lastIndexOf(":"),host=address.slice(0,split),port=Number(address.slice(split+1));select.disabled=true;const response=await fetch("/api/proxies/by-address",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({host,port,renewalDays:Number(select.value)})});select.disabled=false;if(!response.ok){const data=await response.json().catch(()=>({}));alert(data.error||"续费时长保存失败")}};
          small.replaceWith(select);
        }
      });
    }
    const observer=new MutationObserver(records=>{if(records.some(x=>x.addedNodes.length||x.removedNodes.length))enhance()});
    observer.observe(document.body,{childList:true,subtree:true});
    enhance();
    return()=>observer.disconnect();
  },[]);
  return null;
}
