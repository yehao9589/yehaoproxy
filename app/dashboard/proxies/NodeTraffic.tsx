"use client";
import {useEffect,useState,type ReactNode} from "react";
import {serviceExpiryTime} from "../../../lib/service-expiry-display";
import ConsoleIcon from "../../components/ConsoleIcon";

type Traffic={used:number;total:number;remaining:number;pendingBaseline?:boolean;source?:string;online?:boolean;syncedAt?:string|null};
type Data={configured:boolean;traffic:Traffic|null;warning?:string;nextResetAt:string|null};
const gb=(bytes:number)=>(bytes/1e9).toFixed(2);

export default function NodeTraffic({orderId,now,expiryField}:{orderId:string;now:number;expiryField:ReactNode}){
  const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch(`/api/orders/${encodeURIComponent(orderId)}/node-traffic?refresh=1`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error("流量读取失败");
        const result=await response.json() as Data;
        if(!controller.signal.aborted)setData(result);
      }catch{
        if(!controller.signal.aborted)setFailed(true);
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    }
    void load();
    return()=>controller.abort();
  },[orderId,refresh]);

  const traffic=data?.traffic, resetAt=data?.nextResetAt;
  const resetTime=serviceExpiryTime(resetAt||null);
  const overdue=resetTime&&Date.parse(resetAt!)<=now;
  const limited=!!traffic&&traffic.total>0;
  const percent=limited?Math.max(0,Math.min(100,traffic!.used/traffic!.total*100)):0;
  const syncInfo=failed?`刷新暂未成功${data?"，显示上次记录":""}`:data?.warning||
    (traffic?.source==="komari"?`${traffic.online?"在线":"离线"} · ${traffic.syncedAt?`更新于 ${new Date(traffic.syncedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}`:"暂无采样"}`:"");
  return <>
    <div className="customer-node-traffic">
    <div className="customer-node-traffic-head">
      <span>本期流量</span>
      {data?.configured!==false&&<button data-ui="action" data-ui-density="row" data-ui-tone="text" type="button" disabled={loading} onClick={()=>{setLoading(true);setFailed(false);setRefresh(value=>value+1)}}>
        <ConsoleIcon name="renew"/>{loading?"同步中…":"刷新"}
      </button>}
    </div>
    {traffic?<div className="customer-node-meter">
      <div className="customer-node-meter-value"><strong>{gb(traffic.used)} <small>GB</small></strong><span>/ {limited?`${gb(traffic.total)} GB`:"不限量"}</span></div>
      {limited&&<>
        <div className="customer-node-meter-track" role="progressbar" aria-label="本期已用流量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(1))}><span style={{width:`${percent}%`}}/></div>
        <div className="customer-node-meter-caption"><span>剩余 {gb(traffic.remaining)} GB</span><span>已用 {percent.toFixed(1)}%</span></div>
      </>}
      {traffic.pendingBaseline&&<p className="customer-node-sample">等待有效采样，原有用量已保留</p>}
    </div>:<p className="customer-node-sample">{data?.configured===false?"暂未配置流量统计":loading?"正在读取流量…":!syncInfo?"服务流量尚未同步":null}</p>}
    {syncInfo&&<p className="customer-node-sample" role={failed?"status":undefined}>{syncInfo}</p>}
    </div>
    <div className="customer-node-dates">
      {expiryField}
      <div className="customer-node-date">
        <span><ConsoleIcon name="clock"/>下次流量重置</span>
        {resetAt&&resetTime?<><time dateTime={resetAt} title="北京时间">{resetTime.date} {resetTime.time}</time>{overdue&&<small>等待重置</small>}</>:<strong>{data?"未安排":failed?"暂不可用":"读取中…"}</strong>}
      </div>
    </div>
  </>;
}
