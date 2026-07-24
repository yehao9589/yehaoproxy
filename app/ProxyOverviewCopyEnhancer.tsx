"use client";
import {useEffect} from "react";
type Item={host:string;port:number;password:string|null};
type Order={product:string;quantity:number;status:string};
const nodeProducts=new Set(["soft-router","computer-node"]);
const productNames:Record<string,string>={"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理","datacenter":"数据中心代理","soft-router":"软路由中转","computer-node":"电脑节点","node-traffic-reset":"节点流量重置","wallet-topup":"余额充值"};
const statusNames:Record<string,string>={pending:"待付款",paid:"已付款",provisioning:"待开通",active:"已开通",refunded:"已退款",failed:"已取消"};

export default function ProxyOverviewCopyEnhancer(){
  useEffect(()=>{
    if(!location.pathname.startsWith("/dashboard"))return;
    let items:Item[]=[],orders:Order[]=[];
    function decorate(){
      document.querySelectorAll<HTMLElement>(".balance-stat>span").forEach(label=>{if(label.textContent?.trim()==="有效代理")label.textContent="有效服务"});
      const serviceLabel=Array.from(document.querySelectorAll<HTMLElement>(".balance-stat>span")).find(x=>x.textContent?.trim()==="有效服务"),serviceCard=serviceLabel?.parentElement,serviceValue=serviceCard?.querySelector<HTMLElement>("b");
      if(serviceValue&&orders.length){const nodeCount=orders.filter(x=>nodeProducts.has(x.product)&&["paid","provisioning","active"].includes(x.status)).reduce((sum,x)=>sum+x.quantity,0),total=String(items.length+nodeCount);if(serviceValue.textContent!==total)serviceValue.textContent=total}
      document.querySelectorAll<HTMLElement>(".live-orders>div").forEach(row=>{
        const detail=row.querySelector<HTMLElement>("small"),status=row.querySelector<HTMLElement>("em");
        if(detail){const text=detail.textContent||"";for(const[key,name]of Object.entries(productNames)){if(text.startsWith(key)){detail.textContent=name+text.slice(key.length);break}}}
        if(status){const key=status.textContent?.trim().toLowerCase()||"";if(statusNames[key])status.textContent=statusNames[key];const display=status.textContent?.trim()||"";status.classList.remove("status-pending","status-provisioning","status-active","status-refunded","status-failed");if(display==="待付款")status.classList.add("status-pending");else if(["已付款","待开通"].includes(display))status.classList.add("status-provisioning");else if(display==="已开通")status.classList.add("status-active");else if(display==="已退款")status.classList.add("status-refunded");else if(display==="已取消")status.classList.add("status-failed")}
      });
      document.querySelectorAll<HTMLElement>(".proxy-row:not(.head)").forEach(row=>{
        const address=row.children[0]?.textContent?.trim(),passwordCell=row.children[2] as HTMLElement|undefined,item=items.find(x=>`${x.host}:${x.port}`===address);
        const passwordValue=item?.password||"—";
        if(passwordCell&&item&&passwordCell.textContent!==passwordValue)passwordCell.textContent=passwordValue;
        [0,1,2].forEach(index=>{
          const cell=row.children[index] as HTMLElement|undefined;if(!cell)return;
          const value=cell.textContent?.trim()||"";
          cell.classList.add("proxy-copy-direct");
          cell.title=value.includes("••")?"密码已隐藏":`点击复制 ${value}`;
        });
      });
    }
    async function click(event:MouseEvent){
      const cell=(event.target as HTMLElement).closest<HTMLElement>(".proxy-row:not(.head)>span");
      if(!cell)return;
      const row=cell.parentElement;if(!row)return;
      const index=Array.from(row.children).indexOf(cell);
      if(index<0||index>2)return;
      const value=cell.textContent?.trim()||"";
      if(!value||value.includes("••")||value==="—")return;
      await navigator.clipboard.writeText(value);
      cell.classList.add("copied");setTimeout(()=>cell.classList.remove("copied"),900);
    }
    Promise.all([fetch("/api/proxies?reveal=1").then(r=>r.json()),fetch("/api/orders").then(r=>r.json())]).then(([p,o])=>{items=p.items||[];orders=o.items||[];decorate()}).catch(()=>decorate());
    const observer=new MutationObserver(decorate);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    document.addEventListener("click",click);
    return()=>{observer.disconnect();document.removeEventListener("click",click)}
  },[]);
  return null;
}
