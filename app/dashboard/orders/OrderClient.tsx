"use client";
import {useEffect,useState} from "react";
import {countryName} from "../../../lib/countries";
import Pagination from "../../Pagination";
import {dashboardJson,invalidateDashboardData} from "../data-cache";

type BundleItem={id:string;product:string;region:string;quantity:number;durationDays:number;amount:number};
type OrderResource={id:string;orderId:string;ip:string;wifiName:string|null;country:string;city:string|null;protocol:string;status:string};
type O={id:string;product:string;region:string;quantity:number;durationDays:number;amount:number;status:string;createdAt:string;expiresAt?:string|null;renewalOf?:string|null;bundleItems?:BundleItem[]|null;resources?:OrderResource[];serviceRequestStatus?:string|null};
type ServiceRequest={id:string;allocationId:string;type:"renew"|"replace"|"reset_traffic"|"custom";durationDays:number|null;amount:number|null;reason:string|null;status:string;createdAt:string;service?:{kind:"proxy"|"node";orderId:string;product:string;region:string;address:string|null;wifiName:string|null;city:string|null}|null};
const labels:Record<string,string>={pending:"待支付",paid:"待开通",provisioning:"待开通",active:"已开通",refunded:"已退款",failed:"已取消"};
const nodeProducts=new Set(["soft-router","computer-node","node-traffic-reset"]);
const productNames:Record<string,string>={"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理","datacenter":"数据中心代理","soft-router":"软路由中转","computer-node":"电脑节点","node-traffic-reset":"节点流量重置","ip-replacement":"更换 IP 服务","cart-bundle":"购物车合并订单"};
const productLabel=(order:O)=>`${productNames[order.product]||order.product}${order.renewalOf?"续费":""}`;
const regionLabel=(region:string)=>region==="MULTI"?"多个地区":region==="GLOBAL"?"全局节点":`${countryName(region)}（${region}）`;
const groupedBundleItems=(items:BundleItem[]|null|undefined)=>{
  const grouped=new Map<string,BundleItem>();
  for(const item of items||[]){
    const key=`${item.product}\u0000${item.region}\u0000${item.durationDays}`;
    const current=grouped.get(key);
    if(current)grouped.set(key,{...current,quantity:current.quantity+item.quantity,amount:Number((current.amount+item.amount).toFixed(2))});
    else grouped.set(key,{...item});
  }
  return [...grouped.values()];
};
const groupedRegions=(order:O)=>{const grouped=new Map<string,number>();(order.bundleItems?.length?order.bundleItems:[order]).forEach(item=>grouped.set(item.region,(grouped.get(item.region)||0)+item.quantity));return[...grouped].map(([region,quantity])=>`${regionLabel(region)} × ${quantity}`).join("、")};
const statusLabel=(order:O)=>order.serviceRequestStatus==="rejected"?"售后已拒绝":order.serviceRequestStatus==="cancelled"?"售后已取消":order.renewalOf?(order.status==="pending"?"待付款":order.status==="active"?"续费完成":labels[order.status]||order.status):order.product==="node-traffic-reset"?(["paid","provisioning"].includes(order.status)?"等待重置流量中":order.status==="active"?"流量重置完成":labels[order.status]||order.status):order.product==="ip-replacement"?(order.status==="provisioning"?"更换处理中":order.status==="active"?"更换完成":labels[order.status]||order.status):nodeProducts.has(order.product)?(["paid","provisioning"].includes(order.status)?"待开通":order.status==="active"?"已开通":labels[order.status]||order.status):labels[order.status]||order.status;
const statusClass=(order:O)=>order.serviceRequestStatus==="rejected"?"rejected":order.serviceRequestStatus==="cancelled"?"failed":order.status;
const resourceCountry=(resource:OrderResource)=>[countryName(resource.country),resource.city].filter(Boolean).join(" / ");

export default function OrderClient(){
  const[allItems,setItems]=useState<O[]>([]);
  const[allServiceRequests,setServiceRequests]=useState<ServiceRequest[]>([]);
  const[section,setSection]=useState<"orders"|"requests">("orders");
  const[message,setMessage]=useState("");
  const[paidOrder,setPaidOrder]=useState<O|null>(null);
  const[paying,setPaying]=useState<string|null>(null);
  const[paymentMethod,setPaymentMethod]=useState<"wallet"|"alipay">("wallet");
  const[closing,setClosing]=useState<string|null>(null);
  const[checkout,setCheckout]=useState<O|null>(null);
  const[couponCode,setCouponCode]=useState("");
  const[couponMessage,setCouponMessage]=useState("");
  const[discount,setDiscount]=useState(0);
  const[validating,setValidating]=useState(false);
  const[detail,setDetail]=useState<O|null>(null);
  const[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20);
  const total=section==="orders"?allItems.length:allServiceRequests.length,currentPage=Math.min(page,Math.max(1,Math.ceil(total/pageSize))),offset=(currentPage-1)*pageSize;
  const items=allItems.slice(offset,offset+pageSize),serviceRequests=allServiceRequests.slice(offset,offset+pageSize);
  const orderStats={total:allItems.length,pending:allItems.filter(item=>item.status==="pending").length,opening:allItems.filter(item=>["paid","provisioning"].includes(item.status)).length,active:allItems.filter(item=>item.status==="active").length};
  useEffect(()=>setPage(1),[section,pageSize]);
  async function load(force=false){
    setMessage("");
    const ordersTask=dashboardJson<any>("/api/orders",{force});
    const requestsTask=fetch("/api/service-requests").then(async response=>({response,data:await response.json()}));
    const ordersResult=await ordersTask;
    if(!ordersResult.ok)return setMessage(ordersResult.data.error||"订单加载失败");
    setItems(ordersResult.data.items||[]);
    const requested=new URLSearchParams(location.search).get("order");
    if(requested)setDetail((ordersResult.data.items||[]).find((item:O)=>item.id===requested)||null);
    try{const {response,data}=await requestsTask;if(response.ok)setServiceRequests(data.items||[])}catch{}
  }
  useEffect(()=>{void load()},[]);
  useEffect(()=>{[...document.querySelectorAll<HTMLElement>(".order-customer-table small")].filter(item=>item.textContent?.trim().startsWith("到期")).forEach(item=>item.setAttribute("hidden",""));const expiry=[...document.querySelectorAll<HTMLElement>(".customer-order-detail dt")].find(item=>item.textContent?.trim()==="到期时间");expiry?.parentElement?.setAttribute("hidden","")},[detail,items]);
  useEffect(()=>{const rows=[...document.querySelectorAll<HTMLElement>(".order-customer-table .orow:not(.head)")];rows.forEach((row,index)=>{const order=items[index],cell=row.children[1] as HTMLElement|undefined;if(!order||!cell)return;const grouped=new Map<string,number>();(order.bundleItems?.length?order.bundleItems:[order]).forEach(item=>grouped.set(item.product,(grouped.get(item.product)||0)+item.quantity));const title=[...grouped].map(([product,quantity])=>`${productNames[product]||product} × ${quantity}`).join("、");cell.replaceChildren();const label=document.createElement("b");label.textContent=title;cell.append(label);if(order.renewalOf){const source=document.createElement("small");source.textContent=`续费原服务 ${order.renewalOf}`;cell.append(source)}})},[items,section]);
  useEffect(()=>{const rows=[...document.querySelectorAll<HTMLElement>(".order-customer-table .orow:not(.head)")];rows.forEach((row,index)=>{const order=items[index],cell=row.children[2] as HTMLElement|undefined;if(!order||!cell)return;const grouped=new Map<string,number>();(order.bundleItems?.length?order.bundleItems:[order]).forEach(item=>grouped.set(item.region,(grouped.get(item.region)||0)+item.quantity));const label=[...grouped].map(([region,quantity])=>`${regionLabel(region)} × ${quantity}`).join("、");const title=cell.querySelector("b");if(title)title.textContent=label;cell.querySelectorAll("small").forEach(item=>item.setAttribute("hidden",""))})},[items,section]);
  async function validateCoupon(){if(!checkout||!couponCode.trim())return;setValidating(true);setCouponMessage("");const r=await fetch("/api/coupons/validate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:couponCode,amount:checkout.amount})}),d=await r.json();setValidating(false);if(!r.ok){setDiscount(0);return setCouponMessage(d.error||"优惠码不可用")}setCouponCode(d.code);setDiscount(d.discount);setCouponMessage(`已优惠 $${d.discount.toFixed(2)}`)}
  function openCheckout(order:O){setCheckout(order);setCouponCode("");setCouponMessage("");setDiscount(0)}
  async function closeOrder(order:O){
    if(closing||!confirm(`确定关闭订单 ${order.id} 吗？关闭后将返还商品销售额度。`))return;
    setClosing(order.id);setMessage("");
    const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"cancel"})});
    const data=await response.json();setClosing(null);
    if(!response.ok)return setMessage(data.error||"关闭订单失败");
    invalidateDashboardData();setDetail(null);setMessage(data.message||"订单已关闭");await load(true);
  }
  async function pay(order:O,coupon=couponCode){
    setPaying(order.id);setMessage("");
    const r=await fetch(`/api/orders/${order.id}/pay-wallet`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({couponCode:coupon.trim()})}),d=await r.json();
    setPaying(null);
    if(!r.ok)return setMessage(d.error+(d.balance!==undefined?`，当前余额 $${d.balance}`:""));
    setCheckout(null);
    sessionStorage.setItem("yehao-payment-success",JSON.stringify({orderId:order.id,product:order.product,paid:d.paid??order.amount}));
    location.href="/dashboard";
  }
  async function payAlipay(order:O){
    const paymentWindow=window.open("about:blank","_blank");if(paymentWindow){paymentWindow.opener=null;paymentWindow.document.title="正在前往支付宝";paymentWindow.document.body.textContent="正在创建支付宝订单，请稍候…"}
    setPaying(order.id);setMessage("");
    const response=await fetch("/api/checkout/alipay",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId:order.id,couponCode:couponCode.trim()})}),data=await response.json();
    setPaying(null);
    if(!response.ok){paymentWindow?.close();return setMessage(data.error||"创建支付宝支付失败")}
    if(!data.redirectUrl){paymentWindow?.close();return setMessage("支付宝未返回支付地址")}
    if(paymentWindow)paymentWindow.location.href=data.redirectUrl;else window.open(data.redirectUrl,"_blank","noopener,noreferrer");
  }
  return <div className="customer-page order-customer-page">
    <header className="customer-order-page-header"><a href="/dashboard">← 返回客户中心</a><div><small>服务与账单</small><h1>{section==="orders"?"订单管理":"售后申请"}</h1><p>{section==="orders"?"查看购买记录、开通进度与已交付服务":"跟踪更换 IP、流量重置等售后处理进度"}</p></div>{section==="orders"?<a className="primary" href="/#pricing">＋ 购买代理服务</a>:<a className="primary" href="/dashboard?tab=proxies">管理我的服务</a>}</header>
    <section className="customer-order-overview" aria-label="订单概览"><article><span>全部订单</span><b>{orderStats.total}</b><small>累计购买记录</small></article><article><span>待付款</span><b>{orderStats.pending}</b><small>等待完成支付</small></article><article><span>待开通</span><b>{orderStats.opening}</b><small>管理员处理中</small></article><article><span>已开通</span><b>{orderStats.active}</b><small>当前已完成</small></article></section>
    <nav className="customer-order-section-tabs">
      <button className={section==="orders"?"on":""} onClick={()=>setSection("orders")}><span>订单管理</span><b>{allItems.length}</b></button>
      <button className={section==="requests"?"on":""} onClick={()=>setSection("requests")}><span>售后申请</span><b>{allServiceRequests.length}</b></button>
    </nav>
    {message&&<div className="live-error">{message}</div>}
    {paidOrder&&<section className="payment-success-card"><i>✓</i><div><small>PAYMENT SUCCESSFUL</small><h2>支付成功</h2><p>订单 <b>{paidOrder.id}</b> 已进入待开通状态，管理员完成资源配置后会展示在“我的服务”。</p></div><div><a href="/dashboard?tab=proxies" className="primary">查看我的服务</a><button onClick={()=>setPaidOrder(null)}>稍后处理</button></div></section>}
    {detail&&<div className="customer-payment-mask customer-order-detail-mask" onMouseDown={event=>{if(event.target===event.currentTarget)setDetail(null)}}><section className="customer-order-detail"><header><div><small>订单详情</small><h2>订单详情</h2><p>{detail.id}</p></div><button type="button" aria-label="关闭订单详情" title="关闭" onClick={()=>setDetail(null)}>×</button></header><dl><div><dt>产品</dt><dd>{productLabel(detail)}</dd></div>{detail.renewalOf&&<div><dt>续费原服务</dt><dd>{detail.renewalOf}</dd></div>}{groupedBundleItems(detail.bundleItems).map(item=><div key={`${item.product}-${item.region}-${item.durationDays}`}><dt>{productNames[item.product]||item.product}</dt><dd>{regionLabel(item.region)} × {item.quantity} · {item.durationDays} 天 · ${item.amount.toFixed(2)}</dd></div>)}{!detail.bundleItems&&<><div><dt>{nodeProducts.has(detail.product)?"服务范围":"地区 / 数量"}</dt><dd>{regionLabel(detail.region)} × {detail.quantity}</dd></div><div><dt>服务周期</dt><dd>{detail.durationDays} 天{nodeProducts.has(detail.product)?"":"（开通后计时）"}</dd></div></>}{detail.expiresAt&&<div><dt>到期时间</dt><dd>{new Date(detail.expiresAt).toLocaleString("zh-CN",{hour12:false})}</dd></div>}<div><dt>订单金额</dt><dd>${detail.amount.toFixed(2)}</dd></div><div><dt>创建时间</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd></div><div><dt>订单状态</dt><dd><em className={`customer-order-status ${detail.status}`}>{statusLabel(detail)}</em></dd></div></dl><footer>{detail.status==="pending"&&<button className="danger" disabled={closing===detail.id} onClick={()=>void closeOrder(detail)}>{closing===detail.id?"正在关闭…":"关闭订单"}</button>}{detail.status==="pending"&&<button className="primary" onClick={()=>{setDetail(null);openCheckout(detail)}}>立即支付</button>}{["paid","provisioning","active"].includes(detail.status)&&<a className="primary" href="/dashboard?tab=proxies">{nodeProducts.has(detail.product)?"查看节点服务":"查看代理资源"}</a>}</footer></section></div>}
    {checkout&&<div className="customer-payment-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckout(null)}}><section className="customer-payment-modal"><header><div><small>订单支付</small><h2>确认订单付款</h2></div><button onClick={()=>setCheckout(null)}>×</button></header><dl><div><dt>订单</dt><dd>{checkout.id}</dd></div><div><dt>商品</dt><dd>{checkout.bundleItems?`${checkout.bundleItems.length} 项商品 · ${checkout.quantity} 件`:`${productNames[checkout.product]||checkout.product} · ${regionLabel(checkout.region)} × ${checkout.quantity}`}</dd></div><div><dt>订单金额</dt><dd>${checkout.amount.toFixed(2)}</dd></div></dl><label>支付方式<select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value as "wallet"|"alipay")}><option value="wallet">账户余额</option><option value="alipay">支付宝</option></select></label><label>优惠码（选填）<div className="coupon-apply"><input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setDiscount(0);setCouponMessage("")}} placeholder="输入优惠码"/><button type="button" disabled={validating||!couponCode.trim()} onClick={validateCoupon}>{validating?"验证中…":"使用"}</button></div></label>{couponMessage&&<p className={discount>0?"coupon-ok":"coupon-error"}>{couponMessage}</p>}<div className="payment-total"><span>应付金额{discount>0&&<small>已优惠 ${discount.toFixed(2)}</small>}</span><b>${Math.max(0,checkout.amount-discount).toFixed(2)}</b></div><footer><button onClick={()=>setCheckout(null)}>取消</button><button className="primary" disabled={paying===checkout.id} onClick={()=>paymentMethod==="alipay"?payAlipay(checkout):pay(checkout)}>{paying===checkout.id?"正在创建支付…":paymentMethod==="alipay"?"前往支付宝支付":"确认余额支付"}</button></footer></section></div>}
    {section==="orders"&&<div className="standalone-table order-customer-table">
      <div className="orow head"><span>订单号</span><span>产品</span><span>地区 / 数量</span><span>代理信息</span><span>金额</span><span>创建时间</span><span>状态</span><span>操作</span></div>
      {items.length===0?<div className="empty">暂无订单</div>:items.map(o=><div className="orow" key={o.id}>
        <span className="mono"><button className="customer-order-number" onClick={()=>setDetail(o)}>{o.id}</button></span><span>{productLabel(o)}{o.renewalOf&&<small>原服务 {o.renewalOf}</small>}{o.bundleItems&&<small>{groupedBundleItems(o.bundleItems).length} 项商品配置合并结算</small>}</span><span><b>{o.bundleItems?groupedRegions(o):`${regionLabel(o.region)} × ${o.quantity}`}</b>{!o.bundleItems&&<small>{o.durationDays} 天{nodeProducts.has(o.product)?"":"，开通后计时"}</small>}{o.expiresAt&&<small>到期 {new Date(o.expiresAt).toLocaleString("zh-CN",{hour12:false})}</small>}</span><span className="customer-order-resources">{o.resources?.length?o.resources.map(resource=><span key={resource.id}><b className="mono">{resource.ip}</b><small>WiFi：{resource.wifiName||"未设置"}</small><small>{resourceCountry(resource)}</small></span>):<small>{o.status==="active"?"暂未关联代理资源":"开通后显示"}</small>}</span><span>${o.amount.toFixed(2)}</span><span>{new Date(o.createdAt).toLocaleString()}</span><span><em className={`customer-order-status ${o.status}`}>{statusLabel(o)}</em></span>
        <span className="customer-order-actions">
          {o.status==="pending"&&<button className="primary" disabled={paying===o.id} onClick={()=>openCheckout(o)}>{paying===o.id?"正在创建支付…":"立即支付"}</button>}
          {o.status==="pending"&&<button disabled={closing===o.id} onClick={()=>void closeOrder(o)}>{closing===o.id?"关闭中…":"关闭订单"}</button>}
          {o.status==="paid"&&<a href="/dashboard?tab=proxies">查看开通进度</a>}
          {o.status==="provisioning"&&<a href="/dashboard/proxies">查看开通进度</a>}
          {o.status==="active"&&<a href="/dashboard/proxies">查看代理</a>}
          {["refunded","failed"].includes(o.status)&&<a href="/#pricing">重新购买</a>}
        </span>
      </div>)}
    </div>}
    {section==="requests"&&<section className="customer-service-request-history">
      <header><div><h2>售后申请记录</h2><p>免费更换会同步生成 ¥0 订单，并保留完整的售后处理记录。</p></div><b>{serviceRequests.length} 条</b></header>
      <div className="service-request-history-table">
        <div className="service-request-history-row head"><span>申请信息</span><span>服务类型</span><span>关联服务</span><span>费用</span><span>提交时间</span><span>状态</span></div>
        {serviceRequests.length===0?<div className="empty">暂无售后申请记录</div>:serviceRequests.map(request=><div className="service-request-history-row" key={request.id}>
          <span><b className="mono">{request.id}</b><small>{request.reason||"未填写原因"}</small></span>
          <span>{request.type==="replace"?"更换 IP":request.type==="reset_traffic"?"流量重置":request.type==="renew"?"服务续费":"一次性服务"}</span>
          <span className="request-related-service">{request.service?<><b className={request.service.address?"mono":""}>{request.service.address||productNames[request.service.product]||request.service.product}</b><small>{request.service.address&&<>WiFi：{request.service.wifiName||"未设置"} · </>}{regionLabel(request.service.region)}{request.service.city?` / ${request.service.city}`:""}</small><small>订单 {request.service.orderId}</small></>:<><b>关联服务已不存在</b><small className="mono">资源 {request.allocationId}</small></>}</span>
          <span><strong>¥{Number(request.amount||0).toFixed(2)}</strong>{request.amount===0&&<small className="free-service-label">免费申请</small>}</span>
          <span>{new Date(request.createdAt).toLocaleString("zh-CN",{hour12:false})}</span>
          <span><em className={`service-request-status ${request.status}`}>{request.status==="pending"?"待处理":request.status==="approved"?"已批准":request.status==="completed"?"已完成":request.status==="rejected"?"已拒绝":"已取消"}</em></span>
        </div>)}
      </div>
    </section>}
    <Pagination total={total} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1)}}/>
  </div>;
}
