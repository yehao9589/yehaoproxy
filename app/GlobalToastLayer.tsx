"use client";

import {useEffect,useState} from "react";

type Toast={id:number;text:string;kind:"success"|"error"|"info"};

export default function GlobalToastLayer(){
  const[toasts,setToasts]=useState<Toast[]>([]);

  useEffect(()=>{
    let nextId=1;
    let mutationTimer:number|undefined;
    const cancelMutationToast=()=>{
      if(mutationTimer!==undefined)window.clearTimeout(mutationTimer);
      mutationTimer=undefined;
    };
    const push=(text:string,kind:Toast["kind"]="info",fromMutation=false)=>{
      if(!fromMutation)cancelMutationToast();
      const id=nextId++;
      setToasts([{id,text,kind}]);
      window.setTimeout(()=>setToasts(current=>current.filter(item=>item.id!==id)),3200);
    };
    const originalFetch=window.fetch.bind(window);
    const successText=(url:string,method:string)=>{
      if(url.includes("/orders"))return method==="DELETE"?"订单已删除":"订单信息已保存";
      if(url.includes("/products"))return method==="POST"?"商品已创建":"商品信息已保存";
      if(url.includes("/customers"))return "客户资料已保存";
      if(url.includes("/tickets"))return method==="POST"?"工单操作已完成":"工单信息已保存";
      if(url.includes("/settings")||url.includes("/currencies")||url.includes("/site-"))return "设置已保存";
      if(url.includes("/coupons"))return method==="DELETE"?"优惠券已删除":"优惠券已保存";
      if(url.includes("/service-requests"))return "售后操作已完成";
      if(url.includes("/proxies"))return "代理信息已保存";
      if(method==="DELETE")return "删除成功";
      if(method==="POST")return "操作成功";
      return "更改已保存";
    };
    window.fetch=async(...args:Parameters<typeof fetch>)=>{
      const response=await originalFetch(...args);
      const[input,init]=args;
      const method=String(init?.method||(input instanceof Request?input.method:"GET")).toUpperCase();
      if(["POST","PUT","PATCH","DELETE"].includes(method)){
        const url=String(input instanceof Request?input.url:input);
        if(url.includes("/api/admin/impersonation/heartbeat"))return response;
        if(url.includes("/api/admin/products")||url.includes("/api/admin/product-types"))return response;
        const fallbackError=method==="DELETE"?"删除失败":method==="POST"?"操作失败":"保存失败";
        let resultText=successText(url,method),resultKind:Toast["kind"]="success";
        if(!response.ok){
          resultKind="error";
          const data=await response.clone().json().catch(()=>null);
          resultText=typeof data?.error==="string"&&data.error.trim()?data.error:fallbackError;
        }
        cancelMutationToast();
        mutationTimer=window.setTimeout(()=>{
          mutationTimer=undefined;
          push(resultText,resultKind,true);
        },60);
      }
      return response;
    };
    const originalAlert=window.alert;
    window.alert=(message?:unknown)=>{
      const text=String(message??"");
      const kind=/成功|完成|已保存|已更新|已提交|已发送/.test(text)?"success":/失败|错误|无效|不足|不能|无法|请/.test(text)?"error":"info";
      push(text,kind);
    };
    const feedbackSelector=[
      ".live-error",".auth-error",".auth-success",".offer-success",
      ".settings-toast",".ticket-toast",".customer-ticket-toast",
      ".resource-save-success",".import-success",".import-error",
      ".service-policy-message",".save-ok",".embedded-currency>.setting-note:not(:last-child)",
      ".offer-toast"
    ].join(",");
    const globalize=(root:ParentNode)=>{
      const candidates:Element[]=[];
      if(root instanceof Element&&root.matches(feedbackSelector))candidates.push(root);
      root.querySelectorAll?.(feedbackSelector).forEach(element=>candidates.push(element));
      candidates.forEach(element=>{
        const node=element as HTMLElement;
        if(node.dataset.globalized==="1")return;
        if(node.matches(".offer-toast")){
          cancelMutationToast();
          if(node.dataset.globalToast!=="1")setToasts([]);
          node.dataset.globalized="1";
          return;
        }
        const text=(node.textContent||"").replace(/×\s*$/,"").trim();
        if(!text)return;
        node.dataset.globalized="1";
        const success=node.matches(".auth-success,.offer-success,.settings-toast,.ticket-toast,.customer-ticket-toast,.resource-save-success,.import-success,.save-ok,.service-policy-message.success")
          ||/成功|完成|已保存|已更新|已提交|已发送|已创建|已复制|已开启|已关闭|已删除|已添加|已切换/.test(text);
        push(text,success?"success":"error");
      });
    };
    globalize(document);
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node instanceof Element)globalize(node);
    })));
    observer.observe(document.body,{childList:true,subtree:true});
    const onToast=(event:Event)=>{
      const detail=(event as CustomEvent<{message?:string;kind?:Toast["kind"]}>).detail;
      if(detail?.message)push(detail.message,detail.kind);
    };
    window.addEventListener("yehao:toast",onToast);
    return()=>{
      cancelMutationToast();
      observer.disconnect();
      window.fetch=originalFetch;
      window.alert=originalAlert;
      window.removeEventListener("yehao:toast",onToast);
    };
  },[]);

  if(!toasts.length)return null;
  const item=toasts[toasts.length-1];
  return <div className={`offer-toast ${item.kind==="info"?"success":item.kind}`} data-global-toast="1" role={item.kind==="error"?"alert":"status"} aria-live="polite">
    <span>{item.kind==="error"?"!":"✓"}</span>
    <b>{item.text}</b>
    {item.kind==="error"&&<button type="button" aria-label="关闭提示" onClick={()=>setToasts([])}>×</button>}
  </div>;
}
