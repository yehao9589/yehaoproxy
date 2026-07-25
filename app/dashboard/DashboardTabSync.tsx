"use client";
import {useEffect} from "react";

const tabs=["overview","proxies","orders","wallet","whitelist","support","notifications"] as const;
const tabIndexes:Record<string,number>=Object.fromEntries(tabs.map((tab,index)=>[tab,index]));

export default function DashboardTabSync(){
  useEffect(()=>{
    let syncing=false;
    const sync=()=>{
      const requested=new URLSearchParams(location.search).get("tab")||"overview";
      const tab=requested in tabIndexes?requested:"overview";
      const index=tabIndexes[tab];
      const buttons=document.querySelectorAll<HTMLButtonElement>(".console-menu > button");
      if(buttons[index]&&!buttons[index].classList.contains("on")){
        syncing=true;
        buttons[index].click();
        syncing=false;
      }
    };
    const remember=(event:MouseEvent)=>{
      const button=(event.target as HTMLElement|null)?.closest<HTMLButtonElement>(".console-menu > button");
      if(!button||syncing)return;
      const buttons=[...document.querySelectorAll<HTMLButtonElement>(".console-menu > button")];
      const index=buttons.indexOf(button);
      const tab=tabs[index];
      if(!tab)return;
      const url=new URL(location.href);
      if(tab==="overview")url.searchParams.delete("tab");
      else url.searchParams.set("tab",tab);
      url.searchParams.delete("order");
      history.pushState(history.state,"",`${url.pathname}${url.search}${url.hash}`);
    };
    const reflectActive=()=>{
      const buttons=[...document.querySelectorAll<HTMLButtonElement>(".console-menu > button")];
      const index=buttons.findIndex(button=>button.classList.contains("on"));
      const tab=tabs[index];
      if(!tab)return;
      const current=new URLSearchParams(location.search).get("tab")||"overview";
      if(current===tab)return;
      const url=new URL(location.href);
      if(tab==="overview")url.searchParams.delete("tab");
      else url.searchParams.set("tab",tab);
      url.searchParams.delete("order");
      history.replaceState(history.state,"",`${url.pathname}${url.search}${url.hash}`);
    };
    const observer=new MutationObserver(reflectActive);
    const menu=document.querySelector(".console-menu");
    if(menu)observer.observe(menu,{attributes:true,subtree:true,attributeFilter:["class"]});
    const timer=window.setTimeout(sync,0);
    document.addEventListener("click",remember);
    addEventListener("popstate",sync);
    return()=>{
      clearTimeout(timer);
      document.removeEventListener("click",remember);
      removeEventListener("popstate",sync);
      observer.disconnect();
    };
  },[]);
  return null;
}
