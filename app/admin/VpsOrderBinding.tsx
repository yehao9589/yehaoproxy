"use client";
import {useCallback,useEffect,useState} from "react";
import {saveWithBindingConfirmation} from "./vps-binding-request";
import "./vps-order-binding.css";
type Target={provider:string;serverId:string;name:string};
type Node={provider:string;id:string;name:string;group:string;owner:string;enabled:boolean};
export default function VpsOrderBinding({orderId}:{orderId:string}){
 const[data,setData]=useState<{current:Target[];nodes:Node[]}|null>(null),[provider,setProvider]=useState("komari"),[selected,setSelected]=useState(""),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=useCallback(async()=>{const r=await fetch(`/api/admin/vps-binding?orderId=${encodeURIComponent(orderId)}`),d=await r.json();if(!r.ok)throw new Error(d.error||"节点加载失败");setData(d);setProvider(d.current[0]?.provider||"komari");setSelected(d.current[0]?.serverId||"")},[orderId]);
 useEffect(()=>{void load().catch(e=>setMessage(e.message))},[load]);
 async function save(unbind=false){setBusy(true);setMessage("");try{const saved=await saveWithBindingConfirmation("/api/admin/vps-binding",{orderId,...(unbind?{action:"unbind"}:{provider,serverId:selected})});if(saved){await load();setMessage(unbind?"VPS 绑定已解除":"VPS 绑定已保存，原绑定已自动替换")}else setMessage("已取消，原绑定保持不变")}catch(e){setMessage(e instanceof Error?e.message:"保存失败")}finally{setBusy(false)}}
 const unchanged=data?.current.length===1&&data.current[0].provider===provider&&data.current[0].serverId===selected;
 return <section className="xpanel-order-binding vps-unified-binding"><div className="xpanel-order-head"><div><h3>VPS 绑定</h3><p>每个订单仅绑定一台 VPS：Komari 与 X-Panel 二选一，更换时需确认。</p></div><button type="button" disabled={busy} onClick={()=>void load().catch(e=>setMessage(e.message))}>刷新列表</button></div>
 {message&&<p role="status">{message}</p>}
 <p>当前绑定：{data?.current.length?data.current.map(t=>`${t.provider==="komari"?"Komari":"X-Panel"} / ${t.name}`).join("、"):"尚未绑定"}{(data?.current.length||0)>1&&<strong>（存在旧版重复绑定，请选择保留的一台）</strong>}</p>
 <div className="xpanel-vps-bind"><label>绑定来源<select value={provider} disabled={busy} onChange={e=>{setProvider(e.target.value);setSelected("");setQuery("")}}><option value="komari">Komari</option><option value="xpanel">X-Panel</option></select></label><label>搜索 VPS<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称或分组"/></label><label>选择 VPS<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">请选择服务器</option>{data?.nodes.filter(n=>n.provider===provider&&(n.id===selected||`${n.name} ${n.group}`.toLowerCase().includes(query.trim().toLowerCase()))).map(n=><option key={n.id} value={n.id} disabled={Boolean(n.owner&&n.owner!==orderId)}>{n.name}{n.group?` · ${n.group}`:""}{n.owner&&n.owner!==orderId?" · 已被其他订单占用":""}{!n.enabled?" · 同步未启用":""}</option>)}</select></label><button type="button" className="primary" disabled={busy||!selected||unchanged} onClick={()=>void save()}>{busy?"处理中…":data?.current.length?"切换绑定":"保存绑定"}</button>{Boolean(data?.current.length)&&<button type="button" disabled={busy} onClick={()=>void save(true)}>解除绑定</button>}</div>
 </section>;
}
