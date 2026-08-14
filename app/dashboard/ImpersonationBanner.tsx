"use client";
import {useEffect,useRef} from "react";

export default function ImpersonationBanner(){
  const lastRenewed=useRef(0);
  useEffect(()=>{
    const renew=()=>{
      const now=Date.now();
      if(now-lastRenewed.current<60_000)return;
      lastRenewed.current=now;
      void fetch("/api/admin/impersonation/heartbeat",{method:"POST",cache:"no-store"});
    };
    const events:[keyof WindowEventMap,EventListener][]=[["pointerdown",renew],["keydown",renew],["focus",renew]];
    events.forEach(([name,listener])=>window.addEventListener(name,listener,{passive:true}));
    renew();
    return()=>events.forEach(([name,listener])=>window.removeEventListener(name,listener));
  },[]);
  return <div className="impersonation-banner"><span><b>管理员模拟登录</b> · 当前正在查看客户面板</span><a href="/api/admin/impersonation/return">返回管理后台</a></div>;
}
