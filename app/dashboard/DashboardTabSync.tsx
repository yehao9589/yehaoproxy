"use client";
import {useEffect} from "react";

const tabs=["overview","proxies","orders","wallet","whitelist","support","notifications"] as const;
const tabIndexes:Record<string,number>=Object.fromEntries(tabs.map((tab,index)=>[tab,index]));

export default function DashboardTabSync(){
  useEffect(()=>{
    const loginUrl=()=>`/login?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`;
    const originalFetch=window.fetch.bind(window);
    let redirecting=false;
    let animationTimer=0;
    const showPageLoading=()=>{
      const content=document.querySelector<HTMLElement>(".console-content");
      if(!content)return;
      content.classList.remove("is-switching");
      void content.offsetWidth;
      content.classList.add("is-switching");
      window.clearTimeout(animationTimer);
      animationTimer=window.setTimeout(()=>content.classList.remove("is-switching"),750);
    };
    const redirectToLogin=()=>{
      if(redirecting)return;
      redirecting=true;
      location.replace(loginUrl());
    };
    window.fetch=async(input,init)=>{
      const response=await originalFetch(input,init);
      const target=typeof input==="string"?input:input instanceof URL?input.href:input.url;
      if(response.status===401&&target.includes("/api/")&&!target.includes("/api/auth/login"))redirectToLogin();
      return response;
    };
    void originalFetch("/api/auth/me",{cache:"no-store"}).then(response=>{if(response.status===401)redirectToLogin()}).catch(()=>undefined);
    let syncing=false;
    const sync=()=>{
      const requested=new URLSearchParams(location.search).get("tab")||"overview";
      const tab=requested in tabIndexes?requested:"overview";
      const index=tabIndexes[tab];
      const buttons=document.querySelectorAll<HTMLButtonElement>(".console-menu > button");
      if(buttons[index]&&!buttons[index].classList.contains("on")){
        syncing=true;
        showPageLoading();
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
      showPageLoading();
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
      clearTimeout(animationTimer);
      document.removeEventListener("click",remember);
      removeEventListener("popstate",sync);
      observer.disconnect();
      window.fetch=originalFetch;
    };
  },[]);
  return null;
}
