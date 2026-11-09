"use client";
import {useEffect,useState} from "react";
import {serviceExpiryTime} from "../../../lib/service-expiry-display";

type Traffic={used:number;total:number;remaining:number;pendingBaseline?:boolean;source?:string;online?:boolean;syncedAt?:string|null};
type Data={configured:boolean;traffic:Traffic|null;warning?:string;nextResetAt:string|null};
const gb=(bytes:number)=>(bytes/1e9).toFixed(2);

export default function NodeTraffic({orderId,now}:{orderId:string;now:number}){
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
  const percent=limited?Math.min(100,traffic!.used/traffic!.total*100):0;
  return <div className="node-traffic-card">
    {data?.configured!==false&&<><div><span>本期服务流量</span><button data-ui="action" data-ui-tone="secondary" type="button" disabled={loading} onClick={()=>{setLoading(true);setFailed(false);setRefresh(value=>value+1)}}>{loading?"同步中":"刷新"}</button></div>
      {traffic?<><b>{gb(traffic.used)} GB <small>/ {limited?`${gb(traffic.total)} GB`:"不限量"}</small></b>
        {limited&&<><i><em style={{width:`${percent}%`}}/></i><p>剩余 {gb(traffic.remaining)} GB · 已用 {percent.toFixed(1)}%</p></>}
        {traffic.pendingBaseline&&<p>等待有效采样，原有用量已保留</p>}
        {traffic.source==="komari"&&!data?.warning&&<p>{traffic.online?"在线":"离线"} · {traffic.syncedAt?`更新于 ${new Date(traffic.syncedAt).toLocaleString("zh-CN")}`:"暂无采样"}</p>}
      </>:data?.configured&&!data.warning&&<p>服务流量尚未同步</p>}
      {failed?<p role="status">刷新暂未成功{data?"，显示上次记录":""}</p>:data?.warning&&<p>{data.warning}</p>}
    </>}
    <section className="node-traffic-next-reset">
      <span>下次流量重置</span>
      {resetAt&&resetTime?<><time dateTime={resetAt} title="北京时间">{resetTime.date} {resetTime.time}</time>{overdue&&<small>等待重置</small>}</>:<small>{data?"未安排":failed?"暂不可用":"读取中…"}</small>}
    </section>
  </div>;
}
