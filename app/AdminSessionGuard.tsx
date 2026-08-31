"use client";

import {useEffect} from "react";

export default function AdminSessionGuard(){
  useEffect(()=>{
    if(!location.pathname.startsWith("/admin"))return;
    const nativeFetch=window.fetch.bind(window);
    let redirecting=false;
    let checking=false;
    let lastChecked=0;
    const loginUrl=()=>`/login?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}&reason=session-expired`;
    const redirectToLogin=()=>{if(!redirecting){redirecting=true;location.replace(loginUrl())}};
    const verifySession=async()=>{
      if(checking||redirecting)return;
      checking=true;
      lastChecked=Date.now();
      try{
        const response=await nativeFetch("/api/auth/me",{cache:"no-store"});
        if(response.status===401)return redirectToLogin();
        if(response.ok){const user=await response.clone().json().catch(()=>null);if(user?.role!=="admin")location.replace("/dashboard")}
      }catch{
        // 网络故障不代表会话失效，保留页面供用户重试。
      }finally{checking=false}
    };
    window.fetch=async(input,init)=>{
      const response=await nativeFetch(input,init);
      const target=typeof input==="string"?input:input instanceof URL?input.href:input.url;
      if(target.includes("/api/admin/")&&(response.status===401||response.status===403))void verifySession();
      return response;
    };
    void verifySession();
    const onActivity=()=>{if(Date.now()-lastChecked>=60000)void verifySession()};
    const onVisible=()=>{if(document.visibilityState==="visible")void verifySession()};
    window.addEventListener("focus",verifySession);
    document.addEventListener("click",onActivity,true);
    document.addEventListener("keydown",onActivity,true);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{window.fetch=nativeFetch;window.removeEventListener("focus",verifySession);document.removeEventListener("click",onActivity,true);document.removeEventListener("keydown",onActivity,true);document.removeEventListener("visibilitychange",onVisible)};
  },[]);
  return null;
}
