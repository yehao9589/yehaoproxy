"use client";

import { useEffect, useState } from "react";
import OrderDetailWorkspace, { type AdminOrderDetail } from "./OrderDetailWorkspace";
import Pagination from "../Pagination";
import { billActionName, billKind, billKindNames, businessProgress, financialStatus } from "../../lib/bill-workflow";
import {periodLabel} from "../../lib/billing-period";

type Order = AdminOrderDetail["order"] & {
  currency: string; durationDays: number; updatedAt: string;
  allocatedIp?: string | null; allocatedWifiName?: string | null; allocatedCountry?: string | null; allocatedCity?: string | null; displayAmount?: number; billingOrderId?: string | null;
  customerId?: string | null; customerName?: string | null; bundleItems?: Array<{product:string;region:string;quantity:number}> | null;
  serviceRequestStatus?: string | null;
  couponCode?: string | null; discountAmount?: number; originalAmount?: number; paidAmount?: number; paymentSource?:string;
};

const statusNames: Record<string, string> = { pending: "待付款", paid: "等待受理", provisioning: "开通处理中", active: "已激活", refunded: "已退款", failed: "已取消" };
const methods: Record<string, string> = { balance: "余额支付", credit:"信用额支付", balance_credit:"余额 + 信用额支付", manual: "人工确认", alipay: "支付宝", wechat: "微信支付", paypal: "PayPal", usdt: "USDT", bank: "银行转账" };
const productNames: Record<string, string> = { "cart-bundle": "合并订单", "static-isp": "静态住宅 IP", "static-residential": "静态住宅 IP", "dynamic-residential": "动态住宅代理", datacenter: "数据中心代理", "soft-router": "软路由中转", "computer-node": "电脑节点", "node-traffic-reset": "节点流量重置", "ip-replacement": "更换 IP 服务", "wallet-topup": "余额充值" };
const regionNames: Record<string, string> = { US: "美国", JP: "日本", BR: "巴西", GB: "英国", DE: "德国", FR: "法国", CA: "加拿大", AU: "澳大利亚", SG: "新加坡", KR: "韩国", IN: "印度", GLOBAL: "全局服务", MULTI: "多个地区" };
const productName = (value: string) => productNames[value] || value;
const regionName = (value: string) => regionNames[value] || value;
const isRenewalOrder = (order: Order) => billKind(order) === "renewal";
function billSummary(order:Order){if(isRenewalOrder(order))return{products:order.product==="cart-bundle"?"批量服务续费":`${productName(order.product)}续费`,regions:order.product==="cart-bundle"?`${order.bundleItems?.length||order.quantity} 项已有服务`:`${regionName(order.region)} · ${periodLabel(order.durationDays,order.billingCycle||"fixed-days")}`};const source=order.bundleItems?.length?order.bundleItems:[{product:order.product,region:order.region,quantity:order.quantity}],products=new Map<string,number>(),regions=new Map<string,number>();source.forEach(item=>{products.set(item.product,(products.get(item.product)||0)+item.quantity);regions.set(item.region,(regions.get(item.region)||0)+item.quantity)});return{products:[...products].map(([value,count])=>`${productName(value)} × ${count}`).join("、"),regions:[...regions].map(([value,count])=>`${regionName(value)} × ${count}`).join("、")}}

export default function OrderManager({ search = "", kind = "all" }: { search?: string; kind?: "all" | "bills" | "products" }) {
  const [rows, setRows] = useState<Order[]>([]);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [externalSearch, setExternalSearch] = useState("");
  const [category, setCategory] = useState<"bills" | "products">("bills");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(20);
  const effectiveKind = kind === "all" ? category : kind;
  const keyword = (search || externalSearch).trim().toLowerCase();

  useEffect(() => {
    const sync = (event: Event) => setExternalSearch((event as CustomEvent<string>).detail || "");
    window.addEventListener("yehao:order-search", sync);
    return () => window.removeEventListener("yehao:order-search", sync);
  }, []);

  useEffect(() => {
    const refreshOrders = () => { void load(); };
    window.addEventListener("yehao:orders-changed", refreshOrders);
    return () => window.removeEventListener("yehao:orders-changed", refreshOrders);
  }, []);

  async function load() {
    try {
      const [response, serviceResponse,requestResponse] = await Promise.all([fetch("/api/admin/orders?size=100"), fetch("/api/admin/services"),fetch("/api/admin/service-requests")]);
      const data = await response.json(); const services = await serviceResponse.json(); const requests=await requestResponse.json();
      if (!response.ok) throw new Error(data.error || "订单读取失败");
      const servicesByOrder = new Map((services.items || []).filter((item: any) => item.kind === "proxy").map((item: any) => [item.orderId, item]));
      const requestByBill=new Map<string,string>();
      const requestById=new Map<string,string>((requests.items||[]).map((request:any)=>[request.id,request.status]));
      const requestByTarget=new Map<string,string>();
      for(const request of requests.items||[]){const billId=String(request.reason||"").match(/(?:RP|RS|MB|FR|AS|YH)-[A-Z0-9-]+/)?.[0];if(billId)requestByBill.set(billId,request.status)}
      for(const request of requests.items||[]){if(request.allocationId&&!requestByTarget.has(request.allocationId))requestByTarget.set(request.allocationId,request.status)}
      for(const order of data.items||[]){const note=String(order.adminNote||""),requestId=note.match(/\[FREE_REPLACEMENT_REQUEST\]([^\n]+)/)?.[1]?.trim(),targetId=note.match(/\[(?:RESET_OF|TARGET_ORDER|REPLACE_ALLOCATION)\]([^\n]+)/)?.[1]?.trim();if(requestId&&requestById.has(requestId))requestByBill.set(order.id,requestById.get(requestId)!);else if(targetId&&requestByTarget.has(targetId))requestByBill.set(order.id,requestByTarget.get(targetId)!)}
      setRows((data.items || []).map((item: Order) => { const service:any = servicesByOrder.get(item.id); return { ...item, serviceRequestStatus:requestByBill.get(item.id)||null,allocatedIp: service?.address || null, allocatedWifiName: service?.wifiName || null, allocatedCountry: service?.country || null, allocatedCity: service?.city || null }; }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "订单读取失败"); }
  }
  useEffect(() => { void load(); }, []);

  async function open(id: string) {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "订单详情读取失败"); setDetail(data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "订单详情读取失败"); }
    finally { setBusy(false); }
  }

  const scoped = rows.filter((order) => effectiveKind === "products"
    ? order.product !== "cart-bundle" && order.durationDays > 0 && !order.adminNote?.includes("[BILLING_MODE]one-time") && !order.adminNote?.includes("[RENEWAL_OF]")
    : !order.adminNote?.includes("[BUNDLE_PARENT]"));
  const workflowGroup=(order:Order)=>order.status==="pending"?"unpaid":order.status==="refunded"?"refunded":["failed","cancelled","canceled"].includes(order.status)?"cancelled":billKind(order)==="renewal"&&!order.renewalVerified?"verification":billKind(order)==="after-sales"&&order.status!=="active"?"processing":billKind(order)==="purchase"&&["paid","provisioning"].includes(order.status)?"delivery":"completed";
  const visible = scoped.filter((order) => (statusFilter === "all" || workflowGroup(order) === statusFilter) && (!keyword || [order.id, order.billingOrderId, order.customerName, order.customerEmail, order.product, productName(order.product), order.region, regionName(order.region), financialStatus(order), businessProgress(order), billKindNames[billKind(order)]].some((value) => String(value || "").toLowerCase().includes(keyword)))).sort((a, b) => {
    const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === "asc" ? difference : -difference;
  });
  const totalVisible=visible.length,currentPage=Math.min(page,Math.max(1,Math.ceil(totalVisible/pageSize)));
  visible.splice(0,(currentPage-1)*pageSize);visible.splice(pageSize);
  useEffect(()=>{if(effectiveKind!=="bills")return;document.querySelectorAll<HTMLElement>(".bill-ledger .arow.order:not(.ahead)").forEach((row,index)=>{const order=visible[index],cell=row.children[4] as HTMLElement|undefined;if(!order||!cell)return;const amount=document.createElement("b"),method=document.createElement("small");amount.textContent=order.couponCode?`实付 ¥${Number(order.paidAmount??order.amount).toFixed(2)}`:`¥${order.amount.toFixed(2)}`;method.textContent=order.paymentSource?methods[order.paymentSource]||order.paymentSource:order.paymentMethod?methods[order.paymentMethod]||order.paymentMethod:"未选择付款方式";if(!order.couponCode){cell.replaceChildren(amount,method);return}const discount=document.createElement("small");discount.textContent=`原价 ¥${Number(order.originalAmount).toFixed(2)} · 优惠券 ${order.couponCode} -¥${Number(order.discountAmount).toFixed(2)}`;cell.replaceChildren(amount,discount,method)})},[effectiveKind,visible]);
  useEffect(()=>setPage(1),[keyword,statusFilter,effectiveKind,pageSize]);
  const sortButton = <button type="button" className="table-time-sort-arrow" title={sortDir === null ? "默认按下单时间最新在前，点击启用排序" : sortDir === "desc" ? "当前最新在前，点击切换最早在前" : "当前最早在前，点击切换最新在前"} onClick={() => setSortDir((value) => value === "asc" ? "desc" : "asc")}><i className={sortDir === "asc" ? "active" : ""}>▲</i><i className={sortDir === "desc" ? "active" : ""}>▼</i></button>;
  const detailView = <><Pagination total={totalVisible} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1)}}/>{detail&&<OrderDetailWorkspace detail={detail} context={effectiveKind==="bills"?"bill":"product"} onClose={() => setDetail(null)} onChanged={async (next) => { setDetail(next); await load(); }} />}</>;

  const statusTabs: Array<[string, string, number]> = [["all", "全部账单", scoped.length], ["unpaid", "待付款", scoped.filter((item) => workflowGroup(item) === "unpaid").length], ["delivery", "待交付", scoped.filter((item) => workflowGroup(item) === "delivery").length], ["verification", "续费待核验", scoped.filter((item) => workflowGroup(item) === "verification").length], ["processing", "售后处理中", scoped.filter((item) => workflowGroup(item) === "processing").length], ["completed", "已完成", scoped.filter((item) => workflowGroup(item) === "completed").length], ["refunded", "已退款", scoped.filter((item) => workflowGroup(item) === "refunded").length], ["cancelled", "已关闭", scoped.filter((item) => workflowGroup(item) === "cancelled").length]];
  const toolbar = <div className="module-toolbar"><div>{kind === "all" && <><button className={effectiveKind === "bills" ? "on" : ""} onClick={() => { setCategory("bills"); setStatusFilter("all"); }}>账单管理</button><button className={effectiveKind === "products" ? "on" : ""} onClick={() => { setCategory("products"); setStatusFilter("all"); }}>产品订单</button></>}{effectiveKind === "bills" && statusTabs.map(([value, label, count]) => <button key={value} className={statusFilter === value ? "on" : ""} onClick={() => setStatusFilter(value)}>{label} {count}</button>)}</div><button onClick={() => void load()}>刷新订单</button></div>;

  if (effectiveKind === "products") return <div className="product-order-center"><section className="product-order-hero"><div><small>业务管理</small><h2>产品订单</h2><p>每一行代表一项实际购买的产品服务。</p></div><button onClick={() => void load()}>刷新数据</button></section><section className="product-order-list"><header><div><h3>产品服务明细</h3><p>可按订单号、结算账单、客户、商品或地区搜索。</p></div><div><input value={search || externalSearch} onChange={(event) => setExternalSearch(event.target.value)} placeholder="搜索产品订单"/><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></header><div className="product-order-table"><div className="product-order-row head"><span>服务单号</span><span>客户</span><span>代理地址</span><span>WiFi 名称</span><span>国家 / 地区</span><span>产品金额</span><span className="time-sort-head">下单时间 {sortButton}</span><span>状态</span><span>操作</span></div>{visible.map((order) => <div className="product-order-row" key={order.id}><span><button className="order-number-link" onClick={() => void open(order.id)}>{order.id}</button><small>{order.billingOrderId ? `结算账单 ${order.billingOrderId}` : "独立购买"}</small></span><span><b>{order.customerEmail}</b></span><span><b className="mono">{order.allocatedIp||"尚未分配"}</b><small>{productName(order.product)}</small></span><span><b>{order.allocatedWifiName||"未设置"}</b></span><span><b>{regionName(order.allocatedCountry||order.region)}</b><small>{order.allocatedCity||order.allocatedCountry||order.region}</small></span><span className="product-order-money">¥{Number(order.displayAmount ?? order.amount).toFixed(2)}</span><span>{new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</span><span><b className={`order-status ${order.status}`}>{statusNames[order.status] || order.status}</b></span><span className="product-order-actions"><button onClick={() => void open(order.id)}>{["paid", "provisioning"].includes(order.status) ? "开通服务" : "查看详情"}</button></span></div>)}{!visible.length && <div className="empty">暂无匹配的产品订单</div>}</div></section>{busy && <div className="customer-drawer-mask"><div className="customer-drawer loading">正在加载产品订单…</div></div>}{detailView}</div>;

  return <div className="module order-manager bill-ledger">{toolbar}{error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}<div className="bill-logic-note"><b>账单只负责收款与查看进度</b><span>新购服务请在“产品订单”交付；续费只在“续费订单”核验；一次性服务由“售后申请”处理。</span></div><div className="admin-table"><div className="arow order ahead"><span>账单号</span><span>客户</span><span>账单内容</span><span>类型</span><span>金额 / 付款</span><span className="time-sort-head">下单时间 {sortButton}</span><span>收款状态</span><span>业务进度</span><span>操作</span></div>{visible.map((order) => {const summary=billSummary(order),kind=billKind(order);return <div className="arow order" key={order.id}><span><button className="order-number-link" onClick={() => void open(order.id)}>{order.id}</button><small>{order.paymentReference||"暂无支付流水"}</small></span><span><b>{order.customerName||"未设置名称"}</b><small>{order.customerEmail}</small></span><span><b>{summary.products}</b><small>{summary.regions}</small></span><span><em className={`bill-kind ${kind}`}>{billKindNames[kind]}</em></span><span><b>¥{order.amount.toFixed(2)}</b><small>{order.paymentMethod?methods[order.paymentMethod]||order.paymentMethod:"未选择付款方式"}</small></span><span>{new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</span><span><b className={`bill-financial ${workflowGroup(order)}`}>{financialStatus(order)}</b></span><span><b className={`bill-progress ${workflowGroup(order)}`}>{businessProgress(order)}</b></span><span className="live-actions"><button onClick={() => void open(order.id)}>{billActionName(order)}</button></span></div>})}{!visible.length && <div className="empty">{rows.length ? "没有找到匹配的账单" : "暂无账单"}</div>}</div>{busy && <div className="customer-drawer-mask"><div className="customer-drawer loading">正在加载账单详情…</div></div>}{detailView}</div>;
}
