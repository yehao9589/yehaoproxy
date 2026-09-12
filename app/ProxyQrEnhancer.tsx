"use client";
import {useEffect,useMemo,useState} from "react";
import QRCode from "qrcode";
import {copyText} from "../lib/copy-text";

type ProxyItem={host:string;port:number;username:string|null;password:string|null;wifiName:string|null;protocol:string;region:string;transitUrl:string|null};
type Format="colon"|"url"|"auth-first"|"host-first";

function valueOf(item:ProxyItem,format:Format,withAuth:boolean){
  const host=item.host.includes(":")?`[${item.host}]`:item.host,address=`${host}:${item.port}`,user=item.username||"",password=item.password||"";
  if(!withAuth)return address;
  if(format==="url")return `${item.protocol.toLowerCase()==="socks5"?"socks5":"http"}://${user}:${password}@${address}`;
  if(format==="auth-first")return `${user}:${password}@${address}`;
  if(format==="host-first")return `${address}@${user}:${password}`;
  return `${address}:${user}:${password}`;
}

export default function ProxyQrEnhancer(){
  const[item,setItem]=useState<ProxyItem|null>(null),[format,setFormat]=useState<Format>("colon"),[withAuth,setWithAuth]=useState(true),[qr,setQr]=useState(""),[transitQr,setTransitQr]=useState(""),[copied,setCopied]=useState<"direct"|"transit"|null>(null),[error,setError]=useState("");
  const output=useMemo(()=>item?valueOf(item,format,withAuth):"",[item,format,withAuth]);
  const nodeName=useMemo(()=>item?`YehaoProxy-${item.region||"Proxy"}`:"",[item]);
  const qrUri=useMemo(()=>item?`${valueOf(item,"url",withAuth)}#${encodeURIComponent(nodeName)}`:"",[item,withAuth,nodeName]);
  useEffect(()=>{if(!qrUri){setQr("");return}QRCode.toDataURL(qrUri,{width:220,margin:2,errorCorrectionLevel:"M",color:{dark:"#102a43",light:"#ffffff"}}).then(setQr).catch(()=>setError("二维码生成失败"))},[qrUri]);
  useEffect(()=>{if(!item?.transitUrl){setTransitQr("");return}QRCode.toDataURL(item.transitUrl,{width:220,margin:2,errorCorrectionLevel:"M",color:{dark:"#102a43",light:"#ffffff"}}).then(setTransitQr).catch(()=>setError("直连订阅二维码生成失败"))},[item]);
  useEffect(()=>{if(!item&&!error)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous}},[item,error]);
  useEffect(()=>{
    if(!location.pathname.startsWith("/dashboard"))return;
    function enhance(){document.querySelectorAll<HTMLButtonElement>(".managed-proxy-table .proxy-use-button").forEach(button=>{if(button.dataset.usageReady)return;button.dataset.usageReady="1";button.onclick=async event=>{event.preventDefault();event.stopPropagation();setError("");button.disabled=true;try{const row=button.closest(".orow"),address=row?.querySelector<HTMLElement>(".mono")?.dataset.address||row?.querySelector<HTMLElement>(".mono")?.textContent?.trim(),response=await fetch("/api/proxies?reveal=1"),data=await response.json();if(!response.ok)throw new Error(data.error||"代理信息读取失败");const found=(data.items||[]).find((x:ProxyItem)=>`${x.host}:${x.port}`===address) as ProxyItem|undefined;if(!found)throw new Error("代理资源不存在");setItem(found);setFormat("colon");setWithAuth(true)}catch(e){setError(e instanceof Error?e.message:"代理使用信息加载失败")}finally{button.disabled=false}}})}
    const observer=new MutationObserver(records=>{if(records.some(x=>x.addedNodes.length))enhance()});observer.observe(document.body,{childList:true,subtree:true});enhance();return()=>observer.disconnect();
  },[]);
  async function copy(kind:"direct"|"transit",value:string){await copyText(value);setCopied(kind);setTimeout(()=>setCopied(null),1000)}
  if(!item&&!error)return null;
  return <div className="proxy-usage-mask" onMouseDown={e=>{if(e.target===e.currentTarget){setItem(null);setError("")}}}><section className="proxy-usage-modal">
    {error?<><header><h2>加载失败</h2><button onClick={()=>setError("")}>×</button></header><p className="live-error">{error}</p></>:item&&<>
      <header><div><small>静态 IP 连接</small><h2>静态 IP 使用</h2><p>{item.region} · {item.protocol.toUpperCase()} · {item.host}:{item.port}</p></div><button onClick={()=>setItem(null)}>×</button></header>
      {item.transitUrl&&<section className="usage-transit"><div><span>推荐使用</span><h3>直连订阅链接</h3><p>复制链接或扫码导入客户端，即可使用。</p><div className="usage-output"><code>{item.transitUrl}</code><button onClick={()=>void copy("transit",item.transitUrl!)}>{copied==="transit"?"已复制":"复制直连订阅链接"}</button></div></div><div className="usage-transit-qr">{transitQr&&<img src={transitQr} alt="直连订阅二维码"/>}<div className="usage-qr-name"><b>{item.wifiName||"未设置"}</b></div></div></section>}
      <div className="usage-body"><div className="usage-config"><h3 className="usage-section-title">手动配置</h3>
        <section><h3>选择模式</h3><div className="usage-radios"><label><input type="radio" checked={withAuth} onChange={()=>setWithAuth(true)}/>账密模式</label><label><input type="radio" checked={!withAuth} onChange={()=>setWithAuth(false)}/>无账密模式</label></div></section>
        <section><h3>设置格式</h3><select value={format} disabled={!withAuth} onChange={e=>setFormat(e.target.value as Format)}><option value="colon">hostname:port:username:password</option><option value="url">socks5://username:password@hostname:port</option><option value="auth-first">username:password@hostname:port</option><option value="host-first">hostname:port@username:password</option></select></section>
        <section><h3>直连信息</h3><div className="usage-output"><code>{output}</code><button onClick={()=>void copy("direct",output)}>{copied==="direct"?"已复制":"复制"}</button></div><p>直连方式需要设备能够访问该代理 IP，请妥善保管账号与密码。</p></section>
      </div><aside className="usage-qr">{qr&&<img src={qr} alt={`${nodeName} 代理二维码`}/>}<div className="usage-qr-name"><b>{item.wifiName||"未设置"}</b></div></aside></div>
    </>}
  </section></div>;
}
