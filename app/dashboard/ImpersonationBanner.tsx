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
  return (
    <div className="impersonation-banner">
      <span className="impersonation-label">
        <span className="impersonation-label-desktop">管理员模拟登录</span>
        <span className="impersonation-label-compact">正在查看客户面板</span>
      </span>
      <a href="/api/admin/impersonation/return" aria-label="返回管理后台">
        <span className="impersonation-label-desktop">返回管理后台</span>
        <span className="impersonation-label-compact">返回后台</span>
      </a>
    </div>
  );
}
