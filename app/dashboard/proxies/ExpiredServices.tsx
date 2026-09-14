"use client";
import {useEffect,useState} from "react";
import "./expired-services.css";
type Service={id:string;name:string;kind:"proxy"|"node";address:string;region:string;note:string;expiresAt:string;renew:()=>void};
type Request={allocationId:string;type:string;status:string};
export default function ExpiredServices({services,graceDays,archiveDays}:{services:Service[];graceDays:number;archiveDays:number}){
  const [query,setQuery]=useState("");
  const [now,setNow]=useState(0);
  useEffect(()=>{const update=()=>setNow(Date.now());const first=setTimeout(update,0);const timer=setInterval(update,60000);return()=>{clearTimeout(first);clearInterval(timer)}},[]);
  const [requests,setRequests]=useState<Request[]>([]);
  useEffect(()=>{let active=true;const load=()=>fetch("/api/service-requests").then(async r=>{if(r.ok){const data=await r.json();if(active)setRequests(data.items||[])}}).catch(()=>{});void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)}},[]);
  const visible=services.filter(x=>`${x.name} ${x.address} ${x.region} ${x.note}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="expired-services-panel"><header><div><h2>已到期服务 <small>{services.length} 项</small></h2><p>到期超过 {graceDays} 天移入此处，超过 {archiveDays} 天后从客户中心隐藏。续费后按新的到期时间重新分类。</p></div><input aria-label="搜索已到期服务" placeholder="搜索名称、IP、地区或备注" value={query} onChange={e=>setQuery(e.target.value)}/></header>
    <div className="expired-services-list"><div className="expired-service-line expired-service-head"><span>序号</span><span>服务 / 地址</span><span>地区</span><span>备注</span><span>到期时间</span><span>服务状态</span><span>售后进度</span><span>操作</span></div>
    {visible.map((x,index)=>{const request=requests.find(r=>r.allocationId===x.id);const progress=request&&request.status!=="completed"?`${({renew:"续费",replace:"更换 IP",reset_traffic:"流量重置",custom:"附加服务"} as Record<string,string>)[request.type]||"售后"} · ${({pending:"待处理",approved:"处理中",rejected:"已拒绝",cancelled:"已取消"} as Record<string,string>)[request.status]||request.status}`:"暂无进行中售后";return <div className="expired-service-line" key={`${x.kind}-${x.id}`}><span className="expired-sequence">{index+1}</span><div className="expired-service-name"><i className={x.kind}>{x.kind==="proxy"?"IP":"节"}</i><div><b>{x.name}</b>{x.address&&<small title={x.address}>{x.address}</small>}</div></div><span className="expired-service-region" title={x.region}>{x.region||"未设置地区"}</span><span className="expired-service-note" title={x.note}>{x.note||"未填写"}</span><span className="expired-service-date">{new Date(x.expiresAt).toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}</span><div><b className="expired-service-badge">已到期</b><small>已过期 {Math.floor(Math.max(0,now-new Date(x.expiresAt).getTime())/86400000)} 天</small></div><span className={`expired-service-progress ${request&&request.status!=="completed"?"has-request":""}`}>{progress}</span><button type="button" onClick={x.renew}>续费</button></div>})}
    {!visible.length&&<p className="expired-services-empty">{services.length?"没有匹配的服务":"暂无已到期服务"}</p>}</div></section>;
}
