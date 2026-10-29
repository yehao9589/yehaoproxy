"use client";
import {useCallback,useEffect,useState} from "react";
type Traffic={used:number;total:number;remaining:number;pendingBaseline?:boolean};
type Data={configured:boolean;traffic:Traffic|null;warning?:string};
export default function NodeTraffic({orderId}:{orderId:string}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(false);
 const load=useCallback(async(refresh=false)=>{
  setLoading(true);
  try{const r=await fetch(`/api/orders/${encodeURIComponent(orderId)}/node-traffic${refresh?"?refresh=1":""}`,{cache:"no-store"});if(r.ok)setData(await r.json())}
  finally{setLoading(false)}
 },[orderId]);
 useEffect(()=>{setData(null);void load(true).catch(()=>{})},[load]);
 if(!data?.configured)return null;
 const t=data.traffic;
 if(!t)return <div className="node-traffic-mini"><span>流量尚未同步</span><button type="button" disabled={loading} onClick={()=>void load(true).catch(()=>{})}>同步</button></div>;
 const used=t.used/1e9,total=t.total/1e9,percent=total>0?Math.min(100,used/total*100):0;
 return <div className="node-traffic-card"><div><span>本期服务流量</span><button type="button" disabled={loading} onClick={()=>void load(true).catch(()=>{})}>{loading?"同步中":"刷新"}</button></div><b>{used.toFixed(2)} GB <small>/ {total>0?total.toFixed(2)+" GB":"不限量"}</small></b><i><em style={{width:`${percent}%`}}/></i><p>{t.pendingBaseline?"等待有效采样，原有用量已保留":total>0?`剩余 ${(Math.max(0,t.remaining)/1e9).toFixed(2)} GB · 已用 ${percent.toFixed(1)}%`:"按实际使用累计"}</p></div>
}
