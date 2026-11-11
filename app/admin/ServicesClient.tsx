"use client";
import { usePageSize } from "../usePageSize";
import {AdminRefreshButton,useAdminRefresh} from "./AdminRefresh";

import {countryName} from "../../lib/countries";
import {CountryLabel} from "../components/CountryMark";
import {normalizeWifiName} from "../../lib/wifi-name";
import {serviceExpiryDisplay,serviceExpiryTime,type ServiceExpiryState} from "../../lib/service-expiry-display";
import{useEffect,useMemo,useState}from"react";
import CustomersClient from "./customers/CustomersClient";
import OrderDetailWorkspace,{type AdminOrderDetail}from"./OrderDetailWorkspace";
import Pagination from "../Pagination";
type Item={kind:"proxy"|"node";id:string;orderId:string;customerEmail:string;customerId:string|null;customerName:string|null;product:string;region:string;address:string|null;wifiName:string|null;protocol:string|null;country:string|null;city:string|null;durationDays:number;billingCycle:"fixed-days"|"calendar-month";createdAt:string;expiresAt:string|null;autoRenew:boolean;status:string};
const productNames:Record<string,string>={"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理",datacenter:"数据中心代理","computer-node":"电脑节点","soft-router":"软路由中转"};
function wifiNameKey(item:Item){const name=normalizeWifiName(item.wifiName);return item.kind==="proxy"&&name?JSON.stringify([item.customerEmail.trim().toLowerCase(),name]):""}
export default function ServicesClient(){
 const[items,setItems]=useState<Item[]>([]),[type,setType]=useState("all"),[expiryFilter,setExpiryFilter]=useState<"all"|ServiceExpiryState>("all"),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[orderDetail,setOrderDetail]=useState<AdminOrderDetail|null>(null),[detailLoading,setDetailLoading]=useState(false),[sortDir,setSortDir]=useState<"asc"|"desc"|null>(null),[page,setPage]=useState(1),[pageSize,setPageSize]=usePageSize(),[clock,setClock]=useState(Date.now);
 useAdminRefresh(load);
  async function load(){setLoading(true);setError("");try{const r=await fetch("/api/admin/services",{cache:"no-store"}),text=await r.text();let d:any={};try{d=text?JSON.parse(text):{}}catch{throw new Error(`服务接口返回异常（${r.status}）`)}if(!r.ok)throw new Error(d.error||`服务数据加载失败（${r.status}）`);setItems(d.items||[])}catch(reason){setError(reason instanceof Error?reason.message:"服务数据加载失败");return false}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer)},[]);
 const expiryCounts=useMemo(()=>{const counts={active:0,expiring:0,expired:0,unknown:0};for(const item of items)counts[serviceExpiryDisplay(item.expiresAt,clock).state]++;return counts},[items,clock]);
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return items.filter(item=>(type==="all"||item.kind===type)&&(expiryFilter==="all"||serviceExpiryDisplay(item.expiresAt,clock).state===expiryFilter)&&(!q||[item.id,item.orderId,item.customerEmail,item.customerName,item.product,productNames[item.product],item.region,item.address,item.wifiName,item.country,item.city,item.protocol].some(value=>String(value||"").toLowerCase().includes(q)))).sort((a,b)=>{if(sortDir===null)return new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime();const left=Date.parse(a.expiresAt||""),right=Date.parse(b.expiresAt||"");if(!Number.isFinite(left))return Number.isFinite(right)?1:0;if(!Number.isFinite(right))return-1;return sortDir==="asc"?left-right:right-left})},[items,type,expiryFilter,query,sortDir,clock]);
 const totalVisible=filtered.length,currentPage=Math.min(page,Math.max(1,Math.ceil(totalVisible/pageSize))),visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);useEffect(()=>setPage(1),[type,expiryFilter,query,pageSize]);
 async function openOrder(id:string){setDetailLoading(true);setError("");try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(id)}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error||"订单详情加载失败");setOrderDetail(d)}catch(reason){setError(reason instanceof Error?reason.message:"订单详情加载失败")}finally{setDetailLoading(false)}}
 function openCustomer(item:Item){if(!item.customerId)return setError("该服务未关联客户档案");window.dispatchEvent(new CustomEvent("yehao:open-customer",{detail:{id:item.customerId}}))}
 async function openResource(item:Item,row:HTMLElement){if(item.kind==="node")return void openOrder(item.orderId);setDetailLoading(true);setError("");try{const [host,port]=String(item.address||"").split(":"),r=await fetch(`/api/admin/orders/${encodeURIComponent(item.orderId)}/resources/by-address?host=${encodeURIComponent(host||"")}&port=${encodeURIComponent(port||"")}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error||"资源详情加载失败");window.dispatchEvent(new CustomEvent("yehao:edit-resource",{detail:{allocationId:d.id,orderId:item.orderId,currentHost:host,currentPort:port,host:d.host||host,port:String(d.port||port),username:d.username||"",password:d.password||"",wifiName:d.wifiName||item.wifiName||"",protocol:d.protocol||item.protocol||"HTTPS",country:d.country||item.country||"",city:d.city||item.city||"",transitUrl:d.transitUrl||"",expiresAt:d.expiresAt||item.expiresAt||"",row}}))}catch(reason){setError(reason instanceof Error?reason.message:"资源详情加载失败")}finally{setDetailLoading(false)}}
 const wifiDuplicateKeys=useMemo(()=>{const counts=new Map<string,number>();for(const item of items){const key=wifiNameKey(item);if(key)counts.set(key,(counts.get(key)||0)+1)}return new Set([...counts].filter(([,count])=>count>1).map(([key])=>key))},[items]);
 const proxyCount=items.filter(item=>item.kind==="proxy").length,nodeCount=items.filter(item=>item.kind==="node").length,renewCount=items.filter(item=>item.autoRenew).length;
 if(loading)return <div className="service-admin-loading">正在汇总客户服务…</div>;
 return <div className="service-admin-page">
  {error&&<div className="live-error">{error}<button onClick={()=>void load()}>重试</button></div>}
  <section className="business-hero"><div><small>SERVICE OPERATIONS</small><h2>服务管理</h2><p>集中管理已经开通的代理 IP、电脑节点与续费策略，快速定位客户和关联资源。</p></div><AdminRefreshButton/></section>
  <div className="service-admin-kpis business-metrics">
   <article><i>服</i><span><small>服务总数</small><b>{items.length}</b><em>{proxyCount} 个代理 IP · {nodeCount} 个节点</em></span></article>
   <article className="service-metric-active"><i className="success">正</i><span><small>正常服务</small><b>{expiryCounts.active}</b><em>距离到期超过 48 小时</em></span></article>
   <article className="service-metric-expiring"><i className="warning">近</i><span><small>即将到期</small><b>{expiryCounts.expiring}</b><em>48 小时内到期，建议跟进</em></span></article>
   <article className="service-metric-expired"><i>期</i><span><small>已到期</small><b>{expiryCounts.expired}</b><em>已超过服务到期时间</em></span></article>
  </div>
  <section className="service-admin-card business-workbench"><header><div><h2>客户服务列表</h2><p>按实际到期时间区分状态 · 自动续费 {renewCount} 项</p></div><AdminRefreshButton/></header>
   <div className="service-admin-filters"><div className="service-expiry-tabs" role="group" aria-label="服务到期状态筛选">
    {([["all","全部服务",items.length],["active","正常服务",expiryCounts.active],["expiring","即将到期",expiryCounts.expiring],["expired","已到期",expiryCounts.expired],...(expiryCounts.unknown?[["unknown","未设到期",expiryCounts.unknown]]:[])] as Array<["all"|ServiceExpiryState,string,number]>).map(([key,label,count])=><button key={key} type="button" data-filter={key} aria-pressed={expiryFilter===key} className={expiryFilter===key?"on":""} onClick={()=>setExpiryFilter(key)}>{label}<b>{count}</b></button>)}
   </div></div>
   <div className="service-admin-toolbar"><div className="service-type-tabs"><button className={type==="all"?"on":""} onClick={()=>setType("all")}>全部类型</button><button className={type==="proxy"?"on":""} onClick={()=>setType("proxy")}>代理 IP {proxyCount}</button><button className={type==="node"?"on":""} onClick={()=>setType("node")}>节点服务 {nodeCount}</button></div><div className="service-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索客户、订单号、IP、WiFi、商品或地区"/>{query&&<button onClick={()=>setQuery("")}>×</button>}</div><strong>{totalVisible} 条结果</strong></div>
   <div className="service-admin-table" tabIndex={0} role="region" aria-label="客户服务明细，可横向滚动">
    <div className="service-row head"><span>序号</span><span>服务</span><span>客户</span><span>资源信息</span><span>WiFi 名称</span><span>地区 / 协议</span><span>计费 / 续费</span><span>到期时间 <button type="button" className="table-time-sort-arrow" aria-label="切换到期时间排序" title={sortDir===null?"默认顺序，点击按到期时间倒序排列":sortDir==="desc"?"当前到期时间从晚到早，点击正序排列":"当前到期时间从早到晚，点击取消排序"} onClick={()=>setSortDir(value=>value===null?"desc":value==="desc"?"asc":null)}><i className={sortDir==="asc"?"active":""}>▲</i><i className={sortDir==="desc"?"active":""}>▼</i></button></span><span className="service-state-column">服务状态</span><span className="service-actions-cell">操作</span></div>
    {visible.map((item,index)=>{
     const period=item.billingCycle==="calendar-month"?`${Math.max(1,Math.round(item.durationDays/30))} 个月`:`${item.durationDays} 天`;
     const expiry=serviceExpiryDisplay(item.expiresAt,clock),time=serviceExpiryTime(item.expiresAt);
     return <div className={`service-row is-${expiry.state}`} data-service-state={expiry.state} key={`${item.kind}-${item.id}`}>
      <span className="table-sequence">{(currentPage-1)*pageSize+index+1}</span>
      <span className="service-identity"><i className={`service-kind-icon ${item.kind}`}>{item.kind==="proxy"?"IP":"节点"}</i><span className="service-identity-text"><b>{productNames[item.product]||item.product}</b><small title={item.orderId}>订单 {item.orderId}</small></span></span>
      <span><button className="service-link" onClick={()=>openCustomer(item)}>{item.customerName||"未设置名称"}</button><small>{item.customerEmail}</small></span>
      <span><button className="service-resource-link mono" title={item.address||undefined} onClick={event=>void openResource(item,event.currentTarget.closest(".service-row") as HTMLElement)}>{item.kind==="proxy"?item.address:"订阅服务"}</button>{item.kind==="node"&&<small>节点服务</small>}</span>
      <span className="service-wifi-cell"><b>{item.wifiName||(item.kind==="proxy"?"未设置":"—")}</b>{wifiDuplicateKeys.has(wifiNameKey(item))&&<em data-ui="status" className="wifi-name-duplicate-badge" title="该客户有多个 IP 使用相同的 WiFi 名称，编辑资源时可查看关联记录">名称重复</em>}</span>
      <span className="service-location-cell"><b><CountryLabel country={item.country||item.region}>{[countryName(item.country||item.region),item.city].filter(Boolean).join(" / ")||"未设置地区"}</CountryLabel></b><small>协议：{item.protocol||"—"}</small></span>
      <span className="service-billing-cell"><b>{period}</b><small title={`${item.billingCycle==="calendar-month"?"自然月计费":"固定天数计费"}，${item.autoRenew?"自动续费":"手动续费"}`}>{item.billingCycle==="calendar-month"?"自然月":"固定"} · {item.autoRenew?"自动续费":"手动续费"}</small></span>
      <span className="service-expiry-cell">{time?<time dateTime={item.expiresAt!} title="北京时间"><b>{time.date}</b><small>{time.time}</small></time>:<b className="service-unset-expiry">未设置</b>}</span>
      <span className="service-state-cell service-state-column"><em data-ui="status" className={`console-status-badge ${expiry.state}`}>{expiry.label}</em><small>{expiry.remaining}</small></span>
      <span className="service-actions-cell" data-ui-density="row"><button data-ui="action" data-ui-tone="secondary" className="service-manage" onClick={()=>void openOrder(item.orderId)}>编辑服务</button></span>
     </div>;
    })}
    {!visible.length&&<div className="service-empty">没有符合条件的服务</div>}
   </div>
  </section>
  <Pagination total={totalVisible} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1)}}/>
  <div className="service-customer-host"><CustomersClient quietLoading/></div>
  {orderDetail&&<OrderDetailWorkspace detail={orderDetail} onClose={()=>setOrderDetail(null)} onChanged={setOrderDetail}/>} 
 </div>;
}
