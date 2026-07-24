"use client";
import {useEffect,useState} from "react";

type O={id:string;product:string;region:string;quantity:number;durationDays:number;amount:number;status:string;createdAt:string};
const labels:Record<string,string>={pending:"待支付",paid:"已付款",provisioning:"开通处理中",active:"已提取完成",refunded:"已退款",failed:"已取消"};

export default function OrderClient(){
  const[items,setItems]=useState<O[]>([]);
  const[message,setMessage]=useState("");
  const[paidOrder,setPaidOrder]=useState<O|null>(null);
  const[paying,setPaying]=useState<string|null>(null);
  const[checkout,setCheckout]=useState<O|null>(null);
  const[couponCode,setCouponCode]=useState("");
  const[couponMessage,setCouponMessage]=useState("");
  const[discount,setDiscount]=useState(0);
  const[validating,setValidating]=useState(false);
  const[detail,setDetail]=useState<O|null>(null);
  async function load(){const r=await fetch("/api/orders"),d=await r.json();if(!r.ok)return setMessage(d.error);setItems(d.items);const requested=new URLSearchParams(location.search).get("order");if(requested)setDetail(d.items.find((item:O)=>item.id===requested)||null)}
  useEffect(()=>{void load()},[]);
  async function validateCoupon(){if(!checkout||!couponCode.trim())return;setValidating(true);setCouponMessage("");const r=await fetch("/api/coupons/validate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:couponCode,amount:checkout.amount})}),d=await r.json();setValidating(false);if(!r.ok){setDiscount(0);return setCouponMessage(d.error||"优惠码不可用")}setCouponCode(d.code);setDiscount(d.discount);setCouponMessage(`已优惠 $${d.discount.toFixed(2)}`)}
  function openCheckout(order:O){setCheckout(order);setCouponCode("");setCouponMessage("");setDiscount(0)}
  async function pay(order:O,coupon=couponCode){
    setPaying(order.id);setMessage("");
    const r=await fetch(`/api/orders/${order.id}/pay-wallet`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({couponCode:coupon.trim()})}),d=await r.json();
    setPaying(null);
    if(!r.ok)return setMessage(d.error+(d.balance!==undefined?`，当前余额 $${d.balance}`:""));
    setCheckout(null);
    setPaidOrder({...order,status:"paid",amount:d.paid??order.amount});
    await load();
  }
  return <div className="customer-page order-customer-page">
    <header><a href="/dashboard">← 返回客户中心</a><h1>订单管理</h1><a className="primary" href="/#pricing">＋ 购买地区额度</a></header>
    {message&&<div className="live-error">{message}</div>}
    {paidOrder&&<section className="payment-success-card"><i>✓</i><div><small>PAYMENT SUCCESSFUL</small><h2>支付成功</h2><p>订单 <b>{paidOrder.id}</b> 已获得 {paidOrder.region} 地区 {paidOrder.quantity} 条代理额度，有效期将在提取 IP 后开始计算。</p></div><div><a href="/dashboard/proxies" className="primary">立即提取 IP</a><button onClick={()=>setPaidOrder(null)}>稍后处理</button></div></section>}
    {detail&&<div className="customer-payment-mask customer-order-detail-mask" onMouseDown={event=>{if(event.target===event.currentTarget)setDetail(null)}}><section className="customer-order-detail"><header><div><small>ORDER DETAILS</small><h2>订单详情</h2><p>{detail.id}</p></div><button onClick={()=>setDetail(null)}>×</button></header><dl><div><dt>产品</dt><dd>{detail.product}</dd></div><div><dt>地区额度</dt><dd>{detail.region} × {detail.quantity}</dd></div><div><dt>服务周期</dt><dd>{detail.durationDays} 天（提取后计时）</dd></div><div><dt>订单金额</dt><dd>${detail.amount.toFixed(2)}</dd></div><div><dt>创建时间</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd></div><div><dt>订单状态</dt><dd><em className={`customer-order-status ${detail.status}`}>{labels[detail.status]||detail.status}</em></dd></div></dl><footer><button onClick={()=>setDetail(null)}>关闭</button>{detail.status==="pending"&&<button className="primary" onClick={()=>{setDetail(null);openCheckout(detail)}}>立即支付</button>}{["paid","provisioning","active"].includes(detail.status)&&<a className="primary" href="/dashboard/proxies">查看代理资源</a>}</footer></section></div>}
    {checkout&&<div className="customer-payment-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckout(null)}}><section className="customer-payment-modal"><header><div><small>余额支付</small><h2>确认订单付款</h2></div><button onClick={()=>setCheckout(null)}>×</button></header><dl><div><dt>订单</dt><dd>{checkout.id}</dd></div><div><dt>商品</dt><dd>{checkout.product} · {checkout.region} × {checkout.quantity}</dd></div><div><dt>订单金额</dt><dd>${checkout.amount.toFixed(2)}</dd></div></dl><label>优惠码（选填）<div className="coupon-apply"><input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setDiscount(0);setCouponMessage("")}} placeholder="输入优惠码"/><button type="button" disabled={validating||!couponCode.trim()} onClick={validateCoupon}>{validating?"验证中…":"使用"}</button></div></label>{couponMessage&&<p className={discount>0?"coupon-ok":"coupon-error"}>{couponMessage}</p>}<div className="payment-total"><span>应付金额{discount>0&&<small>已优惠 ${discount.toFixed(2)}</small>}</span><b>${Math.max(0,checkout.amount-discount).toFixed(2)}</b></div><footer><button onClick={()=>setCheckout(null)}>取消</button><button className="primary" disabled={paying===checkout.id} onClick={()=>pay(checkout)}>{paying===checkout.id?"正在支付…":"确认余额支付"}</button></footer></section></div>}
    <div className="standalone-table order-customer-table">
      <div className="orow head"><span>订单号</span><span>产品</span><span>地区额度</span><span>金额</span><span>创建时间</span><span>状态</span><span>操作</span></div>
      {items.length===0?<div className="empty">暂无订单</div>:items.map(o=><div className="orow" key={o.id}>
        <span className="mono"><button className="customer-order-number" onClick={()=>setDetail(o)}>{o.id}</button></span><span>{o.product}</span><span><b>{o.region} × {o.quantity}</b><small>{o.durationDays} 天，提取后计时</small></span><span>${o.amount.toFixed(2)}</span><span>{new Date(o.createdAt).toLocaleString()}</span><span><em className={`customer-order-status ${o.status}`}>{labels[o.status]||o.status}</em></span>
        <span className="customer-order-actions">
          {o.status==="pending"&&<button className="primary" disabled={paying===o.id} onClick={()=>openCheckout(o)}>{paying===o.id?"正在支付…":"余额支付"}</button>}
          {o.status==="paid"&&<a className="primary" href="/dashboard/proxies">提取 IP</a>}
          {o.status==="provisioning"&&<a href="/dashboard/proxies">查看开通进度</a>}
          {o.status==="active"&&<a href="/dashboard/proxies">查看代理</a>}
          {["refunded","failed"].includes(o.status)&&<a href="/#pricing">重新购买</a>}
        </span>
      </div>)}
    </div>
  </div>;
}
