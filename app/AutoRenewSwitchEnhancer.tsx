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
      });
    }
    const observer=new MutationObserver(records=>{if(records.some(x=>x.addedNodes.length||x.removedNodes.length))enhance()});
    observer.observe(document.body,{childList:true,subtree:true});
    enhance();
    return()=>observer.disconnect();
  },[]);
  return null;
}
