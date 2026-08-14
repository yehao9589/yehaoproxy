"use client";
import {useEffect,useRef,useState} from "react";
import {applyParsedProxy,parseProxyAddress} from "@/lib/proxy-address-parser";
import LocationSelectFields from "./LocationSelectFields";
type Context={sourceOrderId:string;targetOrderId:string;quantity:number;allocated:number;region:string;suggestedExpiresAt?:string|null;durationDays?:number;billingCycle?:"fixed-days"|"calendar-month"|null};

function localMinute(value?:string|null){
  if(!value)return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "";
  const part=(number:number)=>String(number).padStart(2,"0");
  return `${date.getFullYear()}-${part(date.getMonth()+1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export default function ManualAllocationEnhancer(){
  const[open,setOpen]=useState<Context|null>(null),[error,setError]=useState(""),[success,setSuccess]=useState(""),[saving,setSaving]=useState(false),[raw,setRaw]=useState(""),[parseMsg,setParseMsg]=useState("");
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    function enhance(){
      const toolbar=document.querySelector<HTMLElement>(".order-workspace .order-toolbar"),heading=document.querySelector<HTMLElement>(".order-workspace-head h2");
      if(!toolbar||!heading||toolbar.querySelector(".manual-allocation-button"))return;
      const button=document.createElement("button");button.type="button";button.className="manual-allocation-button";button.textContent="＋ 手动填写 IP";
      button.onclick=async()=>{const orderId=heading.textContent?.replace(/^.*?#/,"").trim()||"";button.disabled=true;try{const response=await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`),data=await response.json();if(!response.ok)throw new Error(data.error||"订单读取失败");if(!["paid","provisioning"].includes(data.order.status))throw new Error("只有已付款或开通中的订单可以手动交付");const delivery=data.manualDelivery||{sourceOrderId:orderId,targetOrderId:orderId,quantity:data.order.quantity,allocated:data.allocations.length,region:data.order.region};if(!delivery.targetOrderId)throw new Error(delivery.quantity>0&&delivery.allocated>=delivery.quantity?"该订单的 IP 已全部交付":"没有可手动交付的 IP 产品订单");setError("");setSuccess("");setRaw("");setParseMsg("");setOpen(delivery)}catch(reason){alert(reason instanceof Error?reason.message:"订单读取失败")}finally{button.disabled=false}};
      toolbar.appendChild(button);
    }
    const observer=new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))enhance()});observer.observe(document.body,{childList:true,subtree:true});enhance();return()=>observer.disconnect();
  },[]);
  function recognize(value:string){const parsed=parseProxyAddress(value);if(!parsed||!formRef.current){setParseMsg(value?"未识别，请检查代理格式":"");return}applyParsedProxy(formRef.current,parsed);setParseMsg(`已识别 ${parsed.host}:${parsed.port}${parsed.username?"（含账号密码）":"（无账号密码）"}`)}
  function changeRaw(value:string){setRaw(value);recognize(value)}
  function reopenOrder(id:string){setOpen(null);window.dispatchEvent(new CustomEvent("yehao:orders-changed"));document.querySelector<HTMLButtonElement>(".order-workspace-head>div:last-child>button")?.click();setTimeout(()=>[...document.querySelectorAll<HTMLButtonElement>(".order-number-link")].find(button=>button.textContent?.trim()===id)?.click(),350)}
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!open||saving)return;setSaving(true);setError("");setSuccess("");const form=event.currentTarget,body=Object.fromEntries(new FormData(form));try{const response=await fetch(`/api/admin/orders/${encodeURIComponent(open.targetOrderId)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"manual-allocate",...body})}),responseText=await response.text();let data:any={};try{data=responseText?JSON.parse(responseText):{}}catch{throw new Error(`交付接口返回异常（${response.status}），请检查服务日志`)}if(!response.ok)throw new Error(data.error||`交付失败（${response.status}）`);const sourceResponse=await fetch(`/api/admin/orders/${encodeURIComponent(open.sourceOrderId)}`),sourceText=await sourceResponse.text();let sourceData:any={};try{sourceData=sourceText?JSON.parse(sourceText):{}}catch{throw new Error(`订单刷新接口返回异常（${sourceResponse.status}）`)}const delivery=sourceData.manualDelivery;if(sourceResponse.ok&&delivery?.targetOrderId){setOpen(delivery);setSuccess(`已录入 1 条，总进度 ${delivery.allocated}/${delivery.quantity} 条`);form.reset();setRaw("");setParseMsg("")}else{setSuccess("全部 IP 已交付，订单已激活，有效期开始计算");setTimeout(()=>reopenOrder(open.sourceOrderId),900)}}catch(reason){setError(reason instanceof Error?reason.message:"交付失败")}finally{setSaving(false)}}
  if(!open)return null;
  const cycleText=open.billingCycle==="calendar-month"?`${Math.max(1,Math.round((open.durationDays||30)/30))} 个自然月`:`${open.durationDays||0} 天`;
  return <div className="manual-allocation-mask" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(null)}}><form ref={formRef} className="manual-allocation-modal" onSubmit={save}><header><div><small>订单 {open.sourceOrderId}</small><h2>手动交付 IP</h2><p>{open.region} 地区 · 已录入 {open.allocated}/{open.quantity} 条</p></div><button type="button" aria-label="关闭窗口" onClick={()=>setOpen(null)}>×</button></header>{error&&<div className="live-error">{error}</div>}{success&&<div className="resource-save-success">✓ {success}</div>}<section className="proxy-recognizer"><label>粘贴代理信息<textarea value={raw} onChange={event=>changeRaw(event.target.value)} placeholder="支持 host:port:username:password、socks5://username:password@host:port 等格式"/></label><button type="button" onClick={()=>recognize(raw)}>自动识别</button>{parseMsg&&<p className={parseMsg.startsWith("已识别")?"ok":"error"}>{parseMsg}</p>}</section><div className="manual-allocation-grid"><label>IP / 主机地址<input name="host" required placeholder="例如 66.17.66.107"/></label><label>端口<input name="port" type="number" min="1" max="65535" required placeholder="443"/></label><label>用户名<input name="username" placeholder="无认证可留空"/></label><label>密码<input name="password" type="text" placeholder="无认证可留空"/></label><label>WiFi 名称<input name="wifiName" placeholder="例如 Home-WiFi"/></label><label>连接协议<select name="protocol" defaultValue="HTTPS"><option value="HTTPS">HTTPS</option><option value="HTTP">HTTP</option><option value="SOCKS5">SOCKS5</option></select></label><LocationSelectFields key={open.targetOrderId} initialCountry={open.region}/><label>到期时间<input key={open.suggestedExpiresAt||open.targetOrderId} name="expiresAt" type="datetime-local" defaultValue={localMinute(open.suggestedExpiresAt)}/><small>已按订单周期自动识别：{cycleText}</small></label></div><p className="manual-allocation-note">系统已按交付时间和订单服务周期预填到期时间；如有特殊情况仍可人工调整。</p><footer><button type="button" onClick={()=>setOpen(null)}>取消</button><button className="primary" disabled={saving}>{saving?"正在交付…":open.allocated+1>=open.quantity?"交付并完成订单":"保存并继续录入"}</button></footer></form></div>;
}
