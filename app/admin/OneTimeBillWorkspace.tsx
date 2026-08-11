"use client";

import { useState } from "react";
import LocationSelectFields from "../LocationSelectFields";

type Detail = any;

const productNames: Record<string,string> = {
  "ip-replacement": "更换 IP",
  "node-traffic-reset": "节点流量重置",
};
const statusNames: Record<string,string> = {
  pending:"待付款", paid:"已付款", provisioning:"等待处理", active:"已完成",
  refunded:"已退款", failed:"已取消",
};
const requestStatus: Record<string,string> = {
  pending:"待处理", approved:"处理中", completed:"已完成", rejected:"已拒绝", cancelled:"已取消",
};

export default function OneTimeBillWorkspace({detail,onClose,onChanged}:{detail:Detail;onClose:()=>void;onChanged?:(value:Detail)=>void|Promise<void>}){
  const [current,setCurrent]=useState(detail);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const order=current.order,context=current.serviceContext,request=context?.request;
  const replacement=context?.kind==="replace";
  const canProcess=["paid","provisioning"].includes(order.status)&&request?.status==="pending";
  const displayedStatus=request?.status==="rejected"?"售后已拒绝":request?.status==="cancelled"?"售后已取消":statusNames[order.status]||order.status;

  async function refresh(){
    const response=await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}`),data=await response.json();
    if(!response.ok)throw new Error(data.error||"账单详情刷新失败");
    setCurrent(data);await onChanged?.(data);
  }
  async function process(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!request)return setError("该账单尚未生成对应的售后任务，请确认账单已经支付");
    setBusy(true);setError("");setSuccess("");
    const body=Object.fromEntries(new FormData(event.currentTarget));
    try{
      const response=await fetch(`/api/admin/service-requests/${encodeURIComponent(request.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve",...body})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"售后任务处理失败");
      setSuccess(replacement?"IP 已更换，账单与售后任务均已完成":"服务任务已执行完成");
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"售后任务处理失败")}finally{setBusy(false)}
  }
  return <div className="order-workspace-mask customer-record-order-mask" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="order-workspace one-time-bill-workspace" onMouseDown={event=>event.stopPropagation()}>
      <header className="order-workspace-head"><div><span>账单管理 / 一次性服务</span><h2>{productNames[order.product]||"一次性服务"}</h2><p>{order.id}</p></div><div><b className={`order-status ${request?.status==="rejected"?"refunded":request?.status==="cancelled"?"failed":order.status}`}>{displayedStatus}</b><button type="button" onClick={onClose}>×</button></div></header>
      {error&&<div className="live-error">{error}<button type="button" onClick={()=>setError("")}>×</button></div>}
      {success&&<div className="live-success">{success}</div>}
      <div className="one-time-bill-body">
        <section className="one-time-summary"><div><span>客户</span><b>{current.customer?.name||order.customerEmail}</b><small>{order.customerEmail}</small></div><div><span>付款金额</span><b>¥{Number(order.amount||0).toFixed(2)}</b><small>{order.paymentReference||"暂无支付流水"}</small></div><div><span>账单状态</span><b>{displayedStatus}</b><small>{new Date(order.createdAt).toLocaleString("zh-CN",{hour12:false})}</small></div><div><span>售后进度</span><b>{request?requestStatus[request.status]||request.status:"未生成任务"}</b><small>{request?.id||"支付后自动生成"}</small></div></section>
        <section className="one-time-target"><header><div><h3>关联服务</h3><p>本账单只处理下方已有服务，不创建新的产品或 IP 交付任务。</p></div></header>
          {replacement&&context?.targetAllocation?<div className="one-time-target-grid"><div><span>当前代理地址</span><b className="mono">{context.targetAllocation.host}:{context.targetAllocation.port}</b></div><div><span>账号</span><b>{context.targetAllocation.username||"未设置"}</b></div><div><span>协议</span><b>{context.targetAllocation.protocol}</b></div><div><span>当前城市</span><b>{context.targetAllocation.city||"未设置"}</b></div><div><span>原产品订单</span><b className="mono">{context.targetAllocation.orderId}</b></div><div><span>资源状态</span><b>{context.targetAllocation.status==="active"?"使用中":context.targetAllocation.status}</b></div></div>:
          context?.targetOrder?<div className="one-time-target-grid"><div><span>关联订单</span><b className="mono">{context.targetOrder.id}</b></div><div><span>服务产品</span><b>{context.targetOrder.product}</b></div><div><span>服务地区</span><b>{context.targetOrder.region}</b></div><div><span>当前状态</span><b>{statusNames[context.targetOrder.status]||context.targetOrder.status}</b></div></div>:
          <div className="empty-inline">未找到关联服务，请检查账单关联关系后再处理。</div>}
        </section>
        <form className="one-time-action" onSubmit={process}>
          <header><div><h3>{replacement?"录入更换后的 IP":"执行服务任务"}</h3><p>{replacement?"确认后直接更新原资源，不会新增一条 IP，也不会进入交付流程。":"确认后执行对应售后任务并同步完成账单。"}</p></div></header>
          {replacement&&<div className="one-time-action-grid"><label>新 IP / 主机<input name="host" required placeholder="例如 66.17.66.108"/></label><label>端口<input name="port" required type="number" min="1" max="65535" placeholder="443"/></label><label>账号<input name="username" placeholder="可不填写"/></label><label>密码<input name="password" placeholder="不填写则保留原密码"/></label><label>WiFi 名称<input name="wifiName" placeholder="可不填写"/></label><label>协议<select name="protocol" defaultValue={context?.targetAllocation?.protocol||"HTTPS"}><option>HTTPS</option><option>HTTP</option><option>SOCKS5</option></select></label><LocationSelectFields key={`${request?.id||order.id}-location`} initialCountry={order.region?.match(/^[A-Z]{2}$/)?.[0]||"US"} initialCity={context?.targetAllocation?.city||""}/></div>}
          <label className="one-time-note">处理备注<textarea name="note" rows={3} placeholder="记录采购来源、处理结果或其他内部说明"/></label>
          <footer><button type="button" onClick={onClose}>关闭</button><button className="primary" disabled={busy||!canProcess}>{busy?"正在处理…":request?.status==="completed"?"任务已完成":replacement?"确认更换 IP":"确认执行"}</button></footer>
        </form>
      </div>
    </section>
  </div>;
}
