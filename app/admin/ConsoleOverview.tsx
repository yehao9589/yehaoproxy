"use client";

import {useCallback, useEffect, useId, useRef, useState} from "react";
import ConsoleIcon, {type ConsoleIconName} from "../components/ConsoleIcon";
import {useAdminRefresh} from "./AdminRefresh";
import type {AdminTab} from "./LiveAdmin";

type Order = {id:string; customerEmail:string; customerName?:string; product:string; region:string; quantity:number; amount:number; currency:string; status:string; createdAt:string; adminNote?:string|null; renewalVerified?:boolean};
type Insights = {summary:{orders:number; paidOrders:number}; months:Array<{month:string; orders:number}>};
type ServiceWifi = {id:string; kind:string; orderId:string; wifiName?:string|null};
type OverviewData = {
  insights:Insights|null;
  orders:{items:Order[]; total:number}|null;
  services:{summary:{total:number; proxies:number; nodes:number}; items?:ServiceWifi[]}|null;
  tickets:{items:Array<{status:string}>}|null;
  requests:{items:Array<{status:string}>}|null;
  customers:{total:number}|null;
};
const emptyData:OverviewData = {insights:null,orders:null,services:null,tickets:null,requests:null,customers:null};
const number = (value:number)=>new Intl.NumberFormat("zh-CN",{maximumFractionDigits:0}).format(value);
const amount = (value:number)=>new Intl.NumberFormat("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const productNames:Record<string,string> = {"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理",datacenter:"数据中心代理","soft-router":"软路由中转","computer-node":"电脑节点","node-traffic-reset":"节点流量重置","ip-replacement":"更换 IP 服务","cart-bundle":"组合账单"};
const renewal = (order:Order)=>Boolean(order.adminNote?.includes("[RENEWAL_OF]"));
const needsReview = (order:Order)=>renewal(order)&&(["paid","provisioning"].includes(order.status)||(order.status==="active"&&!order.renewalVerified));
const orderStatus = (order:Order)=>needsReview(order)?"待核验":({pending:"待付款",paid:"待开通",provisioning:"开通中",active:renewal(order)?"续费完成":"已开通",completed:"已完成",refunded:"已退款",failed:"已取消"}[order.status] || order.status);
const date = (value:string)=>{
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(parsed);
};
function orderWifiNames(order:Order,items:ServiceWifi[]) {
  const markerValues = (key:string)=>[...new Set((order.adminNote||"").split("\n").filter(line=>line.startsWith(`[${key}]`)).map(line=>line.slice(key.length+2).trim()).filter(Boolean))];
  const sourceIds = markerValues("RENEWAL_OF");
  const allocationIds = [...new Set([...markerValues("RENEW_ALLOCATION"),...markerValues("REPLACE_ALLOCATION")])];
  if(sourceIds.length>1||allocationIds.length>1)return [];
  // A renewal of one allocation must never inherit every WiFi from its source order.
  const proxies = items.filter(item=>item.kind==="proxy");
  const selected = allocationIds.length===1
    ? proxies.filter(item=>item.id===allocationIds[0]&&(!sourceIds.length||item.orderId===sourceIds[0]))
    : (order.adminNote||"").includes("[RENEWAL_OF]")?[]:proxies.filter(item=>item.orderId===order.id);
  return [...new Set(selected.map(item=>item.wifiName?.trim()).filter((name):name is string=>Boolean(name)))];
}
function WifiName({names}:{names:string[]}) {
  const label = names.slice(0,2).join("、");
  return <td title={names.length?names.join("、"):undefined}>{label||"—"}{names.length>2&&<small>另 {names.length-2} 个</small>}</td>;
}
function orderAmount(order:Order) {
  try{return new Intl.NumberFormat("zh-CN",{style:"currency",currency:order.currency||"CNY"}).format(order.amount);}
  catch{return `${amount(order.amount)} ${order.currency||""}`.trim();}
}
async function read<T>(url:string):Promise<T> {
  const response = await fetch(url,{cache:"no-store"});
  const body = await response.json();
  if(!response.ok)throw new Error(body.error || "数据暂时无法加载");
  return body as T;
}

export default function ConsoleOverview({permissions,onNavigate}:{permissions:string[]; onNavigate:(tab:AdminTab)=>void}) {
  const finance = permissions.includes("finance"), customers = permissions.includes("customers"), manageOrders = permissions.includes("orders"), tickets = permissions.includes("tickets"), requests = permissions.includes("requests");
  const [data,setData] = useState<OverviewData>(emptyData);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState("all");
  const [query,setQuery] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async()=>{
    const current = ++sequence.current;
    const next:OverviewData = {...emptyData};
    const failures:string[] = [];
    const jobs:Promise<void>[] = [];
    // Insights also carries financial records: overview permission alone must not request it.
    if(finance)jobs.push(read<Insights>("/api/admin/insights").then(value=>{next.insights=value;}).catch(()=>{failures.push("财务汇总");}));
    if(manageOrders){
      jobs.push(read<NonNullable<OverviewData["orders"]>>("/api/admin/orders?size=50").then(value=>{next.orders=value;}).catch(()=>{failures.push("最近订单");}));
      jobs.push(read<NonNullable<OverviewData["services"]>>("/api/admin/services").then(value=>{next.services=value;}).catch(()=>{failures.push("服务汇总");}));
    }
    if(customers)jobs.push(read<NonNullable<OverviewData["customers"]>>("/api/admin/customers?size=1").then(value=>{next.customers=value;}).catch(()=>{failures.push("客户汇总");}));
    if(tickets)jobs.push(read<NonNullable<OverviewData["tickets"]>>("/api/admin/tickets").then(value=>{next.tickets=value;}).catch(()=>{failures.push("工单待办");}));
    if(requests)jobs.push(read<NonNullable<OverviewData["requests"]>>("/api/admin/service-requests").then(value=>{next.requests=value;}).catch(()=>{failures.push("售后待办");}));
    await Promise.all(jobs);
    if(current!==sequence.current)return;
    setData(next);
    setLoading(false);
    setError(failures.length?`${failures.join("、")}加载失败，请刷新重试。`:"");
    return failures.length===0;
  },[finance,manageOrders,customers,tickets,requests]);
  const invalidate = useCallback(()=>{sequence.current++;},[]);
  useAdminRefresh(load);
  useEffect(()=>{void load();return invalidate;},[load,invalidate]);

  const orders = manageOrders ? data.orders?.items || [] : [];
  const serviceOrders=orders.filter(x=>x.product!=="wallet-topup");
  const productOrders = serviceOrders.filter(order=>order.product!=="cart-bundle");
  const waitingProvision = productOrders.filter(order=>!renewal(order)&&["paid","provisioning"].includes(order.status)).length;
  const waitingReview = productOrders.filter(needsReview).length;
  const waitingTickets = data.tickets?.items.filter(item=>["open","waiting_staff"].includes(item.status)).length || 0;
  const waitingRequests = data.requests?.items.filter(item=>item.status==="pending").length || 0;
  const pendingAvailable = (manageOrders||tickets||requests)&&(!manageOrders||data.orders!==null)&&(!tickets||data.tickets!==null)&&(!requests||data.requests!==null);
  const pending = pendingAvailable ? waitingProvision+waitingReview+waitingTickets+waitingRequests : null;
  const summary = finance ? data.insights?.summary : undefined;
  const customerCount = customers ? data.customers?.total : undefined;
  const services = manageOrders ? data.services?.summary : undefined;
  const missing = loading?"正在加载…":"数据暂不可用";
  const wifiFor = (order:Order)=>orderWifiNames(order,manageOrders?data.services?.items||[]:[]);
  const search = query.trim().toLowerCase();
  const visible = productOrders.filter(order=>(filter==="all"||(filter==="review"?needsReview(order):filter==="provision"?!renewal(order)&&["paid","provisioning"].includes(order.status):order.status===filter))&&(!search||[order.id,productNames[order.product]||order.product,order.region,...wifiFor(order),...(customers?[order.customerName,order.customerEmail]:[])].some(value=>value?.toLowerCase().includes(search)))).slice(0,7);
  const tasks:Array<{label:string; hint:string; icon:ConsoleIconName; count:number|null; tab:AdminTab}> = [
    ...(manageOrders?[{label:"订单等待开通",hint:"已付款的非续费服务订单",icon:"orders" as const,count:data.orders?waitingProvision:null,tab:"product-orders" as const},{label:"续费等待核验",hint:"续费到账后的人工核验",icon:"renew" as const,count:data.orders?waitingReview:null,tab:"renewal-orders" as const}]:[]),
    ...(tickets?[{label:"工单等待回复",hint:"待处理的客户工单",icon:"support" as const,count:data.tickets?waitingTickets:null,tab:"tickets" as const}]:[]),
    ...(requests?[{label:"售后等待处理",hint:"更换、重置及退款申请",icon:"clock" as const,count:data.requests?waitingRequests:null,tab:"requests" as const}]:[]),
  ];

  return <div className="console-overview" aria-busy={loading}>
    {error&&<div className="live-error" role="alert">{error}<button type="button" onClick={()=>void load()}>重试</button></div>}
    <div className="console-kpi-grid">
      <Kpi label="已付款记录" icon="wallet" value={summary?number(summary.paidOrders):"—"} hint={!finance?"需要财务权限":summary?"含余额充值与服务子订单":missing} disabled={!finance} onClick={()=>onNavigate("finance")}/>
      <Kpi label="有效服务" icon="layers" value={services?number(services.total):"—"} hint={!manageOrders?"需要订单权限":services?`${number(services.proxies)} 个代理 IP · ${number(services.nodes)} 个节点`:missing} disabled={!manageOrders} onClick={()=>onNavigate("services")}/>
      <Kpi label="客户总数" icon="users" value={customerCount===undefined?"—":number(customerCount)} hint={!customers?"需要客户权限":customerCount===undefined?missing:"已注册的普通客户账户"} disabled={!customers} onClick={()=>onNavigate("customers")}/>
      <Kpi label="最近待办" icon="orders" value={pending===null?"—":number(pending)} hint={!tasks.length?"未分配相关功能权限":pending===null?missing:"最近订单、工单与售后"} disabled={!tasks.length} onClick={()=>onNavigate(tasks[0]?.tab||"overview")}/>
    </div>
    <div className="console-overview-main">
      <section className="console-card console-revenue-card">
        <div className="console-card-heading"><div><h2><ConsoleIcon name="chart"/>月度订单记录数量</h2><p>最近有订单的月份 · 含余额充值与服务子订单</p></div>{summary&&<span className="console-card-total">图内合计 {number((data.insights?.months||[]).reduce((sum,month)=>sum+month.orders,0))} 条</span>}</div>
        {finance?(data.insights?<BillCountChart months={data.insights.months}/>:<div className="console-empty">{missing}</div>):<div className="console-empty"><ConsoleIcon name="orders"/><p>订单汇总接口包含财务数据，需要财务权限</p></div>}
        <div className="console-chart-summary"><span>已付款记录 <b>{summary?number(summary.paidOrders):"—"}</b></span><span>累计订单记录 <b>{summary?number(summary.orders):"—"}</b></span><span>统计月份 <b>{summary?data.insights?.months.length:"—"}</b></span></div>
      </section>
      <section className="console-card console-pending-card">
        <div className="console-card-heading"><div><h2><ConsoleIcon name="orders"/>待办事项</h2><p>以最近已载入记录为准</p></div></div>
        <div className="console-task-list">{tasks.map(task=><button type="button" key={task.tab} onClick={()=>onNavigate(task.tab)}><ConsoleIcon name={task.icon}/><span><b>{task.count===null?"—":number(task.count)} {task.label}</b><small>{task.hint}</small></span><ConsoleIcon name="chevron"/></button>)}</div>
        {!tasks.length&&<div className="console-empty">未分配订单、工单或售后权限</div>}
      </section>
    </div>
    <section className="console-card console-orders-card">
      <div className="console-card-heading"><div><h2><ConsoleIcon name="layers"/>最近服务订单</h2><p>最近 50 条账单中的产品与续费订单 · 不含余额充值</p></div>{manageOrders&&<button data-ui="action" data-ui-tone="secondary" type="button" className="console-text-button" onClick={()=>onNavigate("product-orders")}>查看全部<ConsoleIcon name="chevron"/></button>}</div>
      {manageOrders?<>
        <div className="console-toolbar"><div className="console-order-tabs" role="group" aria-label="最近订单状态筛选">{[["all","全部订单"],["pending","待付款"],["provision","待开通"],["review","待核验"]].map(([key,label])=><button type="button" key={key} className={filter===key?"active":""} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div><label className="console-search"><ConsoleIcon name="search"/><input aria-label="搜索最近服务订单" placeholder={customers?"搜索订单、客户、服务或 WiFi":"搜索订单、服务或 WiFi"} value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
        <div className="console-table-scroll"><table className="console-table"><thead><tr><th scope="col">序号</th><th scope="col">订单编号</th>{customers&&<th scope="col">客户</th>}<th scope="col">服务 / 地区</th><th scope="col">WiFi 名称</th>{finance&&<th scope="col">金额</th>}<th scope="col">下单时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{visible.map((order,index)=><tr key={order.id}><td>{index+1}</td><td><b className="console-order-id">{order.id}</b>{renewal(order)&&<small>续费订单</small>}</td>{customers&&<td><b>{order.customerName||"未设置名称"}</b><small>{order.customerEmail}</small></td>}<td><b>{productNames[order.product]||order.product}</b><small>{order.region==="GLOBAL"?"全局服务":order.region} × {order.quantity}</small></td><WifiName names={wifiFor(order)}/>{finance&&<td className="console-amount">{orderAmount(order)}</td>}<td><time dateTime={order.createdAt}>{date(order.createdAt)}</time></td><td><span data-ui="status" className={`console-status-badge ${needsReview(order)?"pending":order.status}`}>{orderStatus(order)}</span></td><td><button data-ui="action" data-ui-tone="secondary" type="button" className="console-text-button" onClick={()=>onNavigate(renewal(order)?"renewal-orders":"product-orders")}>查看订单</button></td></tr>)}</tbody></table></div>
        {!visible.length&&<div className="console-empty">{loading?"正在加载最近订单…":data.orders?"暂无符合条件的服务订单":"最近订单暂时无法加载"}</div>}
        <footer className="console-table-footer"><span>当前显示 {visible.length} 条 · 最近账单范围内筛选</span><span>北京时间</span></footer>
      </>:<div className="console-empty">需要订单权限才能查看服务订单</div>}
    </section>
  </div>;
}

function Kpi({label,icon,value,hint,disabled,onClick}:{label:string; icon:ConsoleIconName; value:string; hint:string; disabled:boolean; onClick:()=>void}) {
  return <button type="button" className="console-card console-kpi-card" disabled={disabled} onClick={onClick}><span className="console-kpi-label"><ConsoleIcon name={icon}/>{label}</span><strong>{value}</strong><small>{hint}</small></button>;
}

function BillCountChart({months}:{months:Insights["months"]}) {
  const gradient = useId().replaceAll(":","");
  if(!months.length)return <div className="console-empty">暂无月度订单记录</div>;
  const max = Math.max(4,Math.ceil(Math.max(...months.map(month=>month.orders))/4)*4);
  const points = months.map((month,index)=>({x:months.length===1?378:58+index/(months.length-1)*642,y:180-month.orders/max*150,...month}));
  const line = points.map((point,index)=>`${index?"L":"M"}${point.x},${point.y}`).join(" ");
  const area = `${line} L${points.at(-1)?.x},180 L${points[0].x},180 Z`;
  return <div className="console-revenue-chart"><svg viewBox="0 0 728 220" role="img" aria-label={`最近 ${months.length} 个有订单月份的记录数量趋势`}><defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2"/><stop offset="100%" stopColor="currentColor" stopOpacity=".025"/></linearGradient></defs>{[0,.25,.5,.75,1].map(tick=><g key={tick} className="console-chart-grid"><line x1="58" x2="700" y1={180-tick*150} y2={180-tick*150}/><text x="48" y={184-tick*150} textAnchor="end">{new Intl.NumberFormat("zh-CN",{notation:"compact",maximumFractionDigits:1}).format(max*tick)}</text></g>)}<path className="console-chart-area" d={area} fill={`url(#${gradient})`}/><path className="console-chart-line" d={line} fill="none"/>{points.map((point,index)=><g key={point.month}><circle className="console-chart-dot" cx={point.x} cy={point.y} r="3.5"><title>{point.month}：{number(point.orders)} 条记录</title></circle>{(points.length<=6||index%2===0||index===points.length-1)&&<text className="console-chart-month" x={point.x} y="207" textAnchor="middle">{point.month}</text>}</g>)}</svg></div>;
}
