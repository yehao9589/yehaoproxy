"use client";
import {useEffect} from "react";

// Session checking only. Dashboard navigation is owned by the Next router.
export default function DashboardTabSync(){
 useEffect(()=>{
  const originalFetch=window.fetch.bind(window);
  let redirecting=false,lastSessionCheck=0;
  const redirectToLogin=()=>{if(redirecting)return;redirecting=true;location.replace(`/login?next=${encodeURIComponent(location.pathname+location.search+location.hash)}`);};
  const verifySession=()=>{if(redirecting||Date.now()-lastSessionCheck<60000)return;lastSessionCheck=Date.now();void originalFetch("/api/auth/me",{cache:"no-store"}).then(r=>{if(r.status===401)redirectToLogin()}).catch(()=>undefined);};
  window.fetch=async(input,init)=>{const response=await originalFetch(input,init),target=typeof input==="string"?input:input instanceof URL?input.href:input.url;if(response.status===401&&target.includes("/api/")&&!target.includes("/api/auth/login"))redirectToLogin();return response;};
  verifySession();
  document.addEventListener("click",verifySession,true);
  document.addEventListener("keydown",verifySession,true);
  return()=>{document.removeEventListener("click",verifySession,true);document.removeEventListener("keydown",verifySession,true);window.fetch=originalFetch;};
 },[]);
 return null;
}
