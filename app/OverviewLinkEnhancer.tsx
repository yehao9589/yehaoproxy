"use client";
import {useEffect} from "react";

export default function OverviewLinkEnhancer(){
  useEffect(()=>{
    function nav(label:string){return [...document.querySelectorAll<HTMLButtonElement>(".admin-pro aside nav button")].find(x=>x.textContent?.includes(label))}
    function enhance(){
      if(document.querySelector(".admin-head h1")?.textContent?.trim()!=="运营概览")return;
      document.querySelectorAll<HTMLElement>(".admin-table .arow.order:not(.ahead)").forEach(row=>{
        if(row.dataset.overviewLinks)return;row.dataset.overviewLinks="1";
        const orderCell=row.children[0] as HTMLElement|undefined,customerCell=row.children[1] as HTMLElement|undefined;
        const orderId=orderCell?.textContent?.trim(),email=customerCell?.textContent?.trim();if(!orderCell||!customerCell||!orderId||!email)return;
        const orderButton=document.createElement("button");orderButton.className="order-number-link";orderButton.textContent=orderId;orderButton.onclick=()=>{nav("订单管理")?.click();let tries=0;const timer=setInterval(()=>{const target=[...document.querySelectorAll<HTMLButtonElement>(".order-number-link")].find(x=>x!==orderButton&&x.textContent?.trim()===orderId);if(target){clearInterval(timer);target.click()}else if(++tries>=20)clearInterval(timer)},100)};orderCell.replaceChildren(orderButton);
        const customerButton=document.createElement("button");customerButton.className="customer-record-link";customerButton.textContent=email;customerButton.onclick=async()=>{customerButton.disabled=true;try{const r=await fetch(`/api/admin/customers?size=5&search=${encodeURIComponent(email)}`),d=await r.json(),customer=d.items?.find((x:any)=>x.email===email)||d.items?.[0];if(!r.ok||!customer)throw new Error("客户档案不存在");nav("客户管理")?.click();setTimeout(()=>window.dispatchEvent(new CustomEvent("yehao:open-customer",{detail:{id:customer.id}})),180)}catch(e){alert(e instanceof Error?e.message:"客户档案打开失败")}finally{customerButton.disabled=false}};customerCell.replaceChildren(customerButton);
      });
    }
    const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});enhance();return()=>observer.disconnect();
  },[]);
  return null;
}
