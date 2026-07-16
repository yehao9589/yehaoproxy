"use client";
import {useEffect} from "react";

function localMinute(value:string){const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16)}

export default function ResourceExpiryEnhancer(){
  useEffect(()=>{
    let resource:{orderId:string;currentHost:string;currentPort:string}|null=null;
    const remember=(event:Event)=>{const detail=(event as CustomEvent).detail;resource={orderId:String(detail?.orderId||""),currentHost:String(detail?.currentHost||detail?.host||""),currentPort:String(detail?.currentPort||detail?.port||"")}};
    window.addEventListener("yehao:edit-resource",remember);
    function enhance(){
      const form=document.querySelector<HTMLFormElement>(".resource-modal");
      if(!form||form.dataset.expiryReady)return;
      form.dataset.expiryReady="1";
      const grid=form.querySelector(".resource-form-grid");
      if(!grid)return;
      const label=document.createElement("label"),input=document.createElement("input");
      label.append("到期时间");input.name="expiresAt";input.type="datetime-local";input.required=true;label.appendChild(input);grid.appendChild(label);
      const heading=document.querySelector<HTMLElement>(".order-workspace-head h2")?.textContent||"",orderId=resource?.orderId||heading.replace(/^.*?#/,"").trim();
      const host=resource?.currentHost||form.querySelector<HTMLInputElement>('input[name="host"]')?.value||"",port=resource?.currentPort||form.querySelector<HTMLInputElement>('input[name="port"]')?.value||"";
      fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/resources/by-address?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`).then(async r=>({ok:r.ok,data:await r.json()})).then(({ok,data})=>{if(ok&&data.expiresAt)input.value=localMinute(data.expiresAt)}).catch(()=>{});
      const note=form.querySelector<HTMLElement>(".resource-form-note");if(note)note.textContent="修改后将同步更新订单及客户面板显示的统一到期时间。";
    }
    const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});enhance();return()=>{observer.disconnect();window.removeEventListener("yehao:edit-resource",remember)};
  },[]);
  return null;
}
