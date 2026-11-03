"use client";
import {useEffect,useRef,useState} from "react";
import {applyParsedProxy,parseProxyAddress} from "@/lib/proxy-address-parser";
import LocationSelectFields from "./LocationSelectFields";
import WifiNameDuplicateHint from "./WifiNameDuplicateHint";
import type {WifiNameSuggestion} from "@/lib/wifi-name";
type Context={sourceOrderId:string;targetOrderId:string;quantity:number;allocated:number;region:string;suggestedExpiresAt?:string|null;durationDays?:number;billingCycle?:"fixed-days"|"calendar-month"|null;wifiNameSuggestion?:WifiNameSuggestion|null};

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
  const[wifiName,setWifiName]=useState(""),[wifiSuggestion,setWifiSuggestion]=useState<WifiNameSuggestion|null>(null),[wifiLoading,setWifiLoading]=useState(false),[wifiError,setWifiError]=useState("");
  const wifiAutomatic=useRef(true),wifiCountry=useRef(""),wifiRequest=useRef(0);
  function applyDelivery(delivery:Context){
    wifiRequest.current++;wifiAutomatic.current=true;wifiCountry.current=delivery.region;
    setWifiSuggestion(delivery.wifiNameSuggestion||null);setWifiName(delivery.wifiNameSuggestion?.suggestedName||"");setWifiLoading(false);setWifiError("");setOpen(delivery);
  }
  function close(){wifiRequest.current++;setOpen(null)}
  async function changeLocation(country:string){
    if(!open||country===wifiCountry.current)return;
    wifiCountry.current=country;const sequence=++wifiRequest.current;
    setWifiLoading(true);setWifiError("");setWifiSuggestion(null);
    if(wifiAutomatic.current)setWifiName("");
    try{
      const response=await fetch(`/api/admin/orders/${encodeURIComponent(open.targetOrderId)}/wifi-name?country=${encodeURIComponent(country)}`,{cache:"no-store"}),data=await response.json();
      if(!response.ok)throw new Error(data.error||"历史名称读取失败");
      if(sequence!==wifiRequest.current)return;
      setWifiSuggestion(data);if(wifiAutomatic.current)setWifiName(data.suggestedName||"");
    }catch(reason){if(sequence===wifiRequest.current)setWifiError(reason instanceof Error?reason.message:"历史名称读取失败")}
    finally{if(sequence===wifiRequest.current)setWifiLoading(false)}
  }
  useEffect(()=>{
    async function launch(event:Event){
      const orderId=(event as CustomEvent<{orderId:string}>).detail?.orderId;if(!orderId)return;
      try{const response=await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"订单读取失败");if(!["paid","provisioning"].includes(data.order.status))throw new Error("只有已付款或开通中的订单可以交付");const delivery=data.manualDelivery||{sourceOrderId:orderId,targetOrderId:orderId,quantity:data.order.quantity,allocated:data.allocations.length,region:data.order.region};if(!delivery.targetOrderId)throw new Error("该订单没有待交付的 IP");setError("");setSuccess("");setRaw("");setParseMsg("");applyDelivery(delivery)}catch(reason){window.dispatchEvent(new CustomEvent("yehao:toast",{detail:{kind:"error",message:reason instanceof Error?reason.message:"订单读取失败"}}))}
    }
    window.addEventListener("yehao:deliver-order",launch);return()=>window.removeEventListener("yehao:deliver-order",launch);
  },[]);
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const onEscape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!saving)close()};window.addEventListener("keydown",onEscape);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onEscape)}},[open,saving]);
  function recognize(value:string){const parsed=parseProxyAddress(value);if(!parsed||!formRef.current){setParseMsg(value?"未识别，请检查代理格式":"");return}applyParsedProxy(formRef.current,parsed);setParseMsg(`已识别 ${parsed.host}:${parsed.port}${parsed.username?"（含账号密码）":"（无账号密码）"}`)}
  function changeRaw(value:string){setRaw(value);recognize(value)}
  function reopenOrder(id:string){close();window.dispatchEvent(new CustomEvent("yehao:orders-changed",{detail:{orderId:id}}));}
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!open||saving||wifiLoading)return;setSaving(true);setError("");setSuccess("");const form=event.currentTarget,body=Object.fromEntries(new FormData(form));try{const response=await fetch(`/api/admin/orders/${encodeURIComponent(open.targetOrderId)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"manual-allocate",...body,wifiNameMode:wifiAutomatic.current?"auto":"custom"})}),responseText=await response.text();let data:any={};try{data=responseText?JSON.parse(responseText):{}}catch{throw new Error(`交付接口返回异常（${response.status}），请检查服务日志`)}if(!response.ok)throw new Error(data.error||`交付失败（${response.status}）`);const wifiWarning=data.wifiNameWarning?`；${data.wifiNameWarning}`:"";const sourceResponse=await fetch(`/api/admin/orders/${encodeURIComponent(open.sourceOrderId)}`,{cache:"no-store"}),sourceText=await sourceResponse.text();let sourceData:any={};try{sourceData=sourceText?JSON.parse(sourceText):{}}catch{throw new Error(`订单刷新接口返回异常（${sourceResponse.status}）`)}const delivery=sourceData.manualDelivery;if(sourceResponse.ok&&delivery?.targetOrderId){form.reset();applyDelivery(delivery);setSuccess(`已录入 1 条${data.wifiName?`（${data.wifiName}）`:""}，总进度 ${delivery.allocated}/${delivery.quantity} 条${wifiWarning}`);setRaw("");setParseMsg("")}else{setSuccess(`全部 IP 已交付，订单已激活，有效期开始计算${wifiWarning}`);setTimeout(()=>reopenOrder(open.sourceOrderId),900)}}catch(reason){setError(reason instanceof Error?reason.message:"交付失败")}finally{setSaving(false)}}
  if(!open)return null;
  const cycleText=open.billingCycle==="calendar-month"?`${Math.max(1,Math.round((open.durationDays||30)/30))} 个自然月`:`${open.durationDays||0} 天`;
  return <div className="manual-allocation-mask" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)close()}}><form ref={formRef} className="manual-allocation-modal" onSubmit={save}><header><div><small>订单 {open.sourceOrderId}</small><h2>录入并交付 IP</h2><p>{open.region} 地区 · 已录入 {open.allocated}/{open.quantity} 条</p></div><button type="button" aria-label="关闭窗口" disabled={saving} onClick={close}>×</button></header><div className="manual-allocation-body">{error&&<div className="live-error">{error}</div>}{success&&<div className="resource-save-success">✓ {success}</div>}<section className="proxy-recognizer"><label>粘贴代理信息<textarea value={raw} onChange={event=>changeRaw(event.target.value)} placeholder="支持 host:port:username:password、socks5://username:password@host:port 等格式"/></label><button type="button" onClick={()=>recognize(raw)}>自动识别</button>{parseMsg&&<p className={parseMsg.startsWith("已识别")?"ok":"error"}>{parseMsg}</p>}</section><div className="manual-allocation-grid"><label>IP / 主机地址<input name="host" required placeholder="例如 66.17.66.107"/></label><label>端口<input name="port" type="number" min="1" max="65535" required placeholder="443"/></label><label>用户名<input name="username" placeholder="无认证可留空"/></label><label>密码<input name="password" type="text" placeholder="无认证可留空"/></label><label className="delivery-wifi-field"><span className="delivery-wifi-heading"><span>WiFi 名称</span><small title={wifiSuggestion?.previousName||undefined}>{wifiLoading?"读取中…":wifiSuggestion?.previousName?`上次：${wifiSuggestion.previousName}`:"暂无历史名称"}</small></span><input name="wifiName" aria-label="WiFi 名称" value={wifiName} onChange={event=>{setWifiName(event.target.value);wifiAutomatic.current=event.target.value===wifiSuggestion?.suggestedName}} placeholder="可自定义，例如 UK01"/><small className={wifiError?"delivery-wifi-error":"delivery-wifi-help"} aria-live="polite">{wifiError|| (wifiLoading?"正在读取该客户同类服务的名称":wifiSuggestion?.suggestedName?(wifiName===wifiSuggestion.suggestedName?"已自动递增，可直接修改":`可自定义，自动建议：${wifiSuggestion.suggestedName}`):wifiSuggestion?.previousName?"上次名称没有可递增编号，请自定义":"同客户、同商品及地区分别编号，可自定义")}</small><WifiNameDuplicateHint orderId={open.targetOrderId} name={wifiName}/></label><label>连接协议<select name="protocol" defaultValue="HTTPS"><option value="HTTPS">HTTPS</option><option value="HTTP">HTTP</option><option value="SOCKS5">SOCKS5</option></select></label><LocationSelectFields key={`${open.targetOrderId}-${open.allocated}`} initialCountry={open.region} onChange={country=>void changeLocation(country)}/><label>到期时间<input key={open.suggestedExpiresAt||open.targetOrderId} name="expiresAt" type="datetime-local" defaultValue={localMinute(open.suggestedExpiresAt)}/><small>已按订单周期自动识别：{cycleText}</small></label><label className="wide">直连订阅链接（可选）<input name="transitUrl" type="url" placeholder="https://example.com/subscription"/><small>填写后客户可直接复制或扫码导入；留空则不展示。</small></label></div><p className="manual-allocation-note">系统已按交付时间和订单服务周期预填到期时间；如有特殊情况仍可人工调整。</p></div><footer><button type="button" disabled={saving} onClick={close}>取消</button><button className="primary" disabled={saving||wifiLoading}>{saving?"正在交付…":open.allocated+1>=open.quantity?"交付并完成订单":"保存并继续录入"}</button></footer></form></div>;
}
