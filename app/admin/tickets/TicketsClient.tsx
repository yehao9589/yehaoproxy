"use client";

import {useEffect,useMemo,useState} from "react";

type Ticket={id:string;customerId:string;customerEmail?:string;customerName?:string|null;subject:string;category:string;priority:string;status:string;assignedAdminId:string|null;createdAt:string;updatedAt:string};
type Message={id:string;authorId:string;authorRole:string;body:string;internal:boolean;createdAt:string};
type Detail={ticket:Ticket;messages:Message[]};
const statusNames:Record<string,string>={open:"新工单",waiting_staff:"等待客服",waiting_customer:"等待客户",resolved:"已解决",closed:"已关闭"};
const priorityNames:Record<string,string>={low:"低",normal:"普通",high:"高",urgent:"紧急"};
const categoryNames:Record<string,string>={connection:"连接问题",billing:"订单与账单",account:"账户安全",product:"产品咨询",general:"其他问题",technical:"技术支持",service:"服务管理",renewal:"服务续费",replace:"更换 IP",ip_replacement:"更换 IP",reset_traffic:"流量重置",node_traffic_reset:"节点流量重置",after_sales:"售后服务"};

export default function TicketsClient(){
  const[items,setItems]=useState<Ticket[]>([]),[detail,setDetail]=useState<Detail|null>(null),[filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  async function load(){setLoading(true);const r=await fetch("/api/admin/tickets"),d=await r.json();setLoading(false);if(!r.ok)return setMessage(d.error||"工单加载失败");setItems(d.items||[])}
  async function open(id:string){setSaving(true);const r=await fetch(`/api/admin/tickets/${id}`),d=await r.json();setSaving(false);if(!r.ok)return setMessage(d.error||"工单详情加载失败");setDetail(d)}
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>items.filter(x=>(filter==="all"||x.status===filter)&&(!query||`${x.id} ${x.subject} ${x.customerEmail||""} ${x.customerName||""}`.toLowerCase().includes(query.toLowerCase()))),[items,filter,query]);
  const counts={all:items.length,open:items.filter(x=>x.status==="open").length,waiting_staff:items.filter(x=>x.status==="waiting_staff").length,waiting_customer:items.filter(x=>x.status==="waiting_customer").length,resolved:items.filter(x=>x.status==="resolved").length};
  async function update(values:Record<string,unknown>){if(!detail)return;setSaving(true);const r=await fetch(`/api/admin/tickets/${detail.ticket.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(values)}),d=await r.json();setSaving(false);if(!r.ok)return setMessage(d.error||"工单更新失败");await load();await open(detail.ticket.id);setMessage("工单信息已更新")}
  async function reply(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!detail)return;const form=e.currentTarget,data=new FormData(form),body=String(data.get("body")||"").trim(),internal=data.get("internal")==="on";if(body.length<2)return setMessage("请输入回复内容");setSaving(true);const r=await fetch(`/api/admin/tickets/${detail.ticket.id}/reply`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body,internal})}),d=await r.json();setSaving(false);if(!r.ok)return setMessage(d.error||"回复失败");form.reset();await load();await open(detail.ticket.id);setMessage(internal?"内部备注已保存":"回复已发送给客户")}
  return <div className="ticket-admin-page">
    {message&&<div className="ticket-toast"><b>{message}</b><button onClick={()=>setMessage("")}>×</button></div>}
    <div className="ticket-kpis"><article><span>全部工单</span><b>{counts.all}</b></article><article><span>新工单</span><b>{counts.open}</b></article><article><span>等待客服</span><b>{counts.waiting_staff}</b></article><article><span>等待客户</span><b>{counts.waiting_customer}</b></article><article><span>已解决</span><b>{counts.resolved}</b></article></div>
    <section className="ticket-admin-card">
      <header><div><h2>工单管理</h2><p>集中处理客户咨询、故障与订单问题</p></div><button onClick={()=>void load()}>刷新</button></header>
      <div className="ticket-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索工单号、主题或客户"/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(statusNames).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select><span>共 {visible.length} 条</span></div>
      <div className="ticket-table"><div className="ticket-table-row head"><span>工单 / 主题</span><span>客户</span><span>分类</span><span>优先级</span><span>状态</span><span>最后更新</span></div>
      {loading?<div className="ticket-empty">正在加载工单…</div>:visible.length?visible.map(x=><button className="ticket-table-row" key={x.id} onClick={()=>void open(x.id)}><span><b>{x.id}</b><small>{x.subject}</small></span><span><b>{x.customerName||"未设置名称"}</b><small>{x.customerEmail||x.customerId}</small></span><span>{categoryNames[x.category]||x.category}</span><span><i className={`ticket-priority ${x.priority}`}>{priorityNames[x.priority]||x.priority}</i></span><span><i className={`ticket-status ${x.status}`}>{statusNames[x.status]||x.status}</i></span><span>{new Date(x.updatedAt).toLocaleString("zh-CN",{hour12:false})}</span></button>):<div className="ticket-empty">当前没有符合条件的工单</div>}</div>
    </section>
    {saving&&!detail&&<div className="ticket-loading">正在加载…</div>}
    {detail&&<div className="ticket-drawer-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><aside className="ticket-drawer">
      <header><div><small>{detail.ticket.id}</small><h2>{detail.ticket.subject}</h2><p>{detail.ticket.customerName||detail.ticket.customerEmail||detail.ticket.customerId} · {categoryNames[detail.ticket.category]||detail.ticket.category}</p></div><button onClick={()=>setDetail(null)}>×</button></header>
      <div className="ticket-controls"><label>状态<select value={detail.ticket.status} onChange={e=>void update({status:e.target.value})}>{Object.entries(statusNames).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label><label>优先级<select value={detail.ticket.priority} onChange={e=>void update({priority:e.target.value})}>{Object.entries(priorityNames).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label></div>
      <div className="ticket-timeline">{detail.messages.map(x=><article className={`${x.authorRole==="admin"?"staff":"customer"} ${x.internal?"internal":""}`} key={x.id}><div><b>{x.internal?"内部备注":x.authorRole==="admin"?"客服回复":"客户留言"}</b><time>{new Date(x.createdAt).toLocaleString("zh-CN",{hour12:false})}</time></div><p>{x.body}</p></article>)}</div>
      <form className="ticket-reply-box" onSubmit={reply}><textarea name="body" rows={5} placeholder="输入回复内容，支持换行…" disabled={detail.ticket.status==="closed"} required/><label><input name="internal" type="checkbox"/> 仅管理员可见的内部备注</label><div><button type="button" onClick={()=>void update({status:"resolved"})}>标记已解决</button><button className="primary" disabled={saving||detail.ticket.status==="closed"}>{saving?"正在发送…":"发送回复"}</button></div></form>
    </aside></div>}
  </div>
}
