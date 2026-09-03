"use client";

import {useEffect, useMemo, useState} from "react";
import "./storefront-products.css";
import StoreCart, {addStoreCartItem} from "./StoreCart";
import { countryFlag, countryName } from "../lib/countries";
const flagClass=(code:string)=>/^[A-Z]{2}$/i.test(code)?`fi fi-${code.toLowerCase()}`:"";

const defaultRegions = [
  {code: "US", flag: "🇺🇸", country: "美国", city: "", price: 3.8},
  {code: "GB", flag: "🇬🇧", country: "英国", city: "", price: 4.2},
  {code: "DE", flag: "🇩🇪", country: "德国", city: "", price: 4},
  {code: "JP", flag: "🇯🇵", country: "日本", city: "", price: 4.8},
  {code: "SG", flag: "🇸🇬", country: "新加坡", city: "", price: 4.6},
  {code: "HK", flag: "🇭🇰", country: "中国香港", city: "", price: 4.5},
];

const defaultProducts = [
  {id: "static-isp", category: "proxy", name: "静态住宅 ISP", desc: "长期独享固定 IP，适合跨境电商和社媒运营"},
  {id: "residential", category: "proxy", name: "动态住宅代理", desc: "全球真实住宅网络，灵活用于数据与业务访问"},
  {id: "datacenter", category: "proxy", name: "数据中心代理", desc: "高速、稳定、低延迟，适合批量业务"},
  {id: "soft-router", category: "node", name: "软路由中转", desc: "提供稳定中转与路由环境，适合多设备统一连接"},
  {id: "computer-node", category: "node", name: "电脑节点", desc: "独享远程电脑环境，按地区和使用周期灵活购买"},
] as Array<{id:string;category:"proxy"|"node";name:string;desc:string}>;

type ProductCategory = "proxy" | "node";
type CatalogOffer = {
  product: string;
  region: string;
  billingCycle: "fixed-days"|"calendar-month";
  price7: number;
  price30: number;
  price90: number;
  price180: number;
};
type SiteConfig = {
  siteName: string;
  logoText: string;
  logoUrl: string;
  topAdEnabled: boolean;
  topAdText: string;
  topAdLink: string;
  footerDescription: string;
  companyName: string;
  supportEmail: string;
  copyright: string;
  icpNumber: string;
};
type CurrentUser = {id:string;email:string;name:string;role:string;status:string};
const initialSiteConfig: SiteConfig = {
  siteName: "YehaoProxy",
  logoText: "Y",
  logoUrl: "",
  topAdEnabled: true,
  topAdText: "新用户专享优惠 · 企业客户可申请专属线路与批量价格",
  topAdLink: "",
  footerDescription: "可靠的全球代理与节点服务，让每一次连接都更简单。",
  companyName: "YehaoProxy",
  supportEmail: "support@yehaoproxy.com",
  copyright: "© 2026 YehaoProxy. All rights reserved.",
  icpNumber: "",
};

export default function Home() {
  const [installationChecked, setInstallationChecked] = useState(false);
  const [category, setCategory] = useState<ProductCategory>("proxy");
  const [products,setProducts]=useState(defaultProducts);
  const [product, setProduct] = useState("static-isp");
  const [duration, setDuration] = useState(30);
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [saleOffers, setSaleOffers] = useState<CatalogOffer[] | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(initialSiteConfig);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const catalogEmpty = catalogLoaded && (!saleOffers?.length || !products.length);
  const regions = useMemo(() => {
    if (!saleOffers) return defaultRegions;
    const codes = [...new Set(saleOffers
      .filter(offer => offer.product === product && offer.region !== "GLOBAL")
      .map(offer => offer.region.toUpperCase()))];
    return codes.map(code => {
      const fallback = defaultRegions.find(item => item.code === code);
      return {
        code,
        flag: countryFlag(code),
        country: countryName(code),
        city: "",
        price: fallback?.price || 4.5,
      };
    });
  }, [saleOffers, product]);
  const visibleProducts = products.filter(item => item.category === category);
  const currentProduct = products.find(item => item.id === product) || products[0] || defaultProducts[0];
  const isNode = currentProduct.category === "node";
  const selectedRegion = regions[selected] || regions[0] || defaultRegions[0];
  const orderRegion = isNode ? "GLOBAL" : selectedRegion.code;
  const currentOffer = saleOffers?.find(offer => offer.product === product && offer.region === orderRegion);
  const billingCycle=currentOffer?.billingCycle||"fixed-days";
  const periodText=(days:number)=>billingCycle==="calendar-month"?`${Math.max(1,Math.round(days/30))} 个自然月`:`${days} 天`;
  const durationPrice=(offer:CatalogOffer|undefined,days:number)=>offer?(days===7?offer.price7:days===90?offer.price90:days===180?offer.price180:offer.price30):null;
  const durationAvailable=(days:number)=>saleOffers===null||Boolean(currentOffer&&Number(durationPrice(currentOffer,days))>=0);
  const fallbackUnitPrice = (isNode ? 29.9 : selectedRegion.price) * (duration === 7 ? .35 : duration === 30 ? 1 : duration === 90 ? 2.55 : 5.1);
  const unitPrice = currentOffer
    ? duration === 7 ? currentOffer.price7 : duration === 90 ? currentOffer.price90 : duration === 180 ? currentOffer.price180 : currentOffer.price30
    : fallbackUnitPrice;
  const total = unitPrice * quantity;
  const productEnabled = (id: string) => saleOffers === null || saleOffers.some(offer => offer.product === id);
  const currentEnabled = (saleOffers === null || saleOffers.some(offer => offer.product === product && (isNode || offer.region === orderRegion))) && durationAvailable(duration);
  useEffect(()=>{if(!currentOffer||durationAvailable(duration))return;const next=[30,90,180,7].find(day=>durationAvailable(day));if(next)setDuration(next)},[currentOffer,duration]);

  useEffect(() => {
    fetch("/api/install", {cache:"no-store"})
      .then(response => response.json())
      .then(status => {
        if (!status.installed) {
          window.location.replace("/install");
          return;
        }
        setInstallationChecked(true);
      })
      .catch(() => window.location.replace("/install"));
  }, []);

  useEffect(() => {
    if (!installationChecked) return;
    fetch("/api/catalog").then(response => response.json()).then(data => {
      if (Array.isArray(data.items)) setSaleOffers(data.items.map((item: CatalogOffer) => ({
        product: item.product,
        region: item.region,
        billingCycle: item.billingCycle||"fixed-days",
        price7: Number(item.price7),
        price30: Number(item.price30),
        price90: Number(item.price90),
        price180: Number(item.price180),
      })));
      if(Array.isArray(data.productTypes)&&data.productTypes.length){
        const next=data.productTypes.map((item:any)=>({id:String(item.id),category:item.category==="node"?"node":"proxy",name:String(item.name),desc:String(item.description||"")}));
        setProducts(next);
        if(!next.some((item:any)=>item.id===product)){const first=next.find((item:any)=>item.category==="proxy")||next[0];if(first){setProduct(first.id);setCategory(first.category)}}
      }
    }).catch(() => {setSaleOffers([]);setProducts([])}).finally(()=>setCatalogLoaded(true));
    fetch("/api/site-config", { cache: "no-store" })
      .then(response => response.json())
      .then(data => setSiteConfig(current => ({ ...current, ...data })))
      .catch(() => undefined);
    fetch("/api/auth/me", {cache:"no-store"})
      .then(async response => response.ok ? setCurrentUser(await response.json()) : setCurrentUser(null))
      .catch(() => setCurrentUser(null));
  }, [installationChecked]);
  useEffect(() => {
    setSelected(0);
    setQuantity(1);
  }, [product]);
  useEffect(() => setQuantity(1), [selected]);

  function chooseCategory(next: ProductCategory) {
    setCategory(next);
    const first = products.find(item => item.category === next && productEnabled(item.id));
    if (first) setProduct(first.id);
  }

  function addToCart() {
    addStoreCartItem({
      product,
      productName: currentProduct.name,
      region: orderRegion,
      regionName: isNode ? "全局节点" : selectedRegion.country,
      durationDays: duration,
      billingCycle,
      quantity,
      unitEstimate: total / quantity,
    });
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", {method:"POST"});
      if (!response.ok) throw new Error("退出失败");
      setCurrentUser(null);
    } finally {
      setLoggingOut(false);
    }
  }

  if (!installationChecked) return <main className="page-loading" aria-busy="true" aria-label="正在检查安装状态" />;

  return <main>
    {siteConfig.topAdEnabled && siteConfig.topAdText && <div className="notice">{siteConfig.topAdLink ? <a href={siteConfig.topAdLink}>{siteConfig.topAdText}</a> : siteConfig.topAdText}</div>}
    <header><a className="brand" href="#">{siteConfig.logoUrl ? <span className="has-logo"><img src={siteConfig.logoUrl} alt="" /></span> : <span>{siteConfig.logoText}</span>} {siteConfig.siteName}</a><nav><a href="#products">产品</a><a href="#pricing">定价</a><a href="#why">解决方案</a><a href="#faq">帮助中心</a></nav>{currentUser?<div className="header-current-user"><span>{(currentUser.name||currentUser.email).slice(0,1).toUpperCase()}</span><div><small>{currentUser.role==="admin"?"超级管理员":"当前登录用户"}</small><b>{currentUser.name||currentUser.email}</b></div><a href={currentUser.role==="admin"?"/admin":"/dashboard"}>{currentUser.role==="admin"?"管理后台":"客户中心"}</a><button type="button" disabled={loggingOut} onClick={()=>void logout()}>{loggingOut?"退出中…":"退出账号"}</button></div>:<div className="header-actions"><a className="ghost" href="/login">登录</a><a className="primary" href="/register">免费注册</a></div>}</header>

    <section className="hero"><div className="hero-copy"><div className="eyebrow">全球企业级网络服务</div><h1>稳定、纯净、<em>即买即用</em>的网络资源</h1><p>为跨境电商、数据业务、远程办公和多设备运营提供可靠连接。</p><div className="hero-actions"><a className="primary large" href="#pricing">立即选购</a><a className="text-link" href="#products">查看产品 →</a></div><div className="metrics"><div><b>80M+</b><span>全球 IP 池</span></div><div><b>99.9%</b><span>网络可用率</span></div><div><b>7×24</b><span>售后支持</span></div></div></div><div className="network-card"><div className="globe">◎<i className="dot d1"/><i className="dot d2"/><i className="dot d3"/></div><div className="status"><i/> 全球网络运行正常 <b>99.99%</b></div></div></section>

    <span id="pricing" className="store-anchor"/>
    <section id="products" className={`section unified-store-section${catalogLoaded?"":" catalog-pending"}${catalogEmpty?" catalog-empty":""}`} aria-busy={!catalogLoaded}>
      <div className="section-head"><div><span className="kicker">产品商城</span><h2>选择商品，直接完成购买配置</h2></div><p>商品、地区、周期和数量集中在同一个界面，无需上下滚动。</p></div>
      {currentUser&&<div className="purchase-user-banner"><span>{(currentUser.name||currentUser.email).slice(0,1).toUpperCase()}</span><div><small>{currentUser.role==="admin"?"当前管理账户":"本次订单购买账号"}</small><b>{currentUser.name||"未设置昵称"}</b><em>{currentUser.email}</em></div><strong>{currentUser.role==="admin"?"管理员":"已登录"}</strong><a href={currentUser.role==="admin"?"/admin":"/dashboard"}>{currentUser.role==="admin"?"进入管理后台 →":"进入客户中心 →"}</a></div>}
      {!catalogLoaded&&<div className="store-catalog-skeleton" role="status"><div><i/><span><b>正在读取商品目录</b><small>正在同步后台商品、地区和价格…</small></span></div><section><i/><i/><i/></section><footer><i/><i/></footer></div>}
      {catalogEmpty&&<div className="store-catalog-empty"><b>暂无可售商品</b><span>商品目录暂时不可用，请稍后刷新或联系客服。</span></div>}
      <div className="store-category-tabs store-category-top">
        <button className={category==="proxy"?"on":""} onClick={()=>chooseCategory("proxy")}><span>◫</span><b>代理 IP</b><small>静态住宅、动态住宅、数据中心</small></button>
        <button className={category==="node"?"on":""} onClick={()=>chooseCategory("node")}><span>▣</span><b>节点服务</b><small>软路由中转、电脑节点</small></button>
      </div>
      <div className="horizontal-product-nav">
        <div className="horizontal-product-label"><span>商品列表</span><b>{category==="proxy"?"代理 IP":"节点服务"}</b></div>
        {visibleProducts.map(item=>{const enabled=productEnabled(item.id);return <button key={item.id} disabled={!enabled} className={`${product===item.id?"active":""} ${!enabled?"unavailable":""}`} onClick={()=>setProduct(item.id)}><span>{item.category==="node"?"▣":"◫"}</span><div><b>{item.name}</b><small>{enabled?item.desc:"后台已关闭售卖"}</small></div><i>{!enabled?"停售":product===item.id?"✓":"›"}</i></button>})}
      </div>
      <div className="store-commerce-grid">
      <div className="unified-store config-only">
        <div className="unified-config-panel">
          <header><div><span>{isNode?"节点服务":"代理 IP"}</span><h3>{currentProduct.name}</h3><p>{currentProduct.desc}</p></div><em>{isNode?"人工开通":"人工开通"}</em></header>
          {!isNode&&<div className="config-block"><div className="config-title"><b>1. 选择地区</b><span className="selected-region"><i className={flagClass(selectedRegion.code)} title={`${selectedRegion.country}国旗`}/>{selectedRegion.country}</span></div><div className="compact-regions">{regions.map((region,index)=>{const offer=saleOffers?.find(item=>item.product===product&&item.region===region.code);const enabled=saleOffers===null||Boolean(offer);const price=offer?(duration===7?offer.price7:duration===90?offer.price90:duration===180?offer.price180:offer.price30):region.price*(duration===7?.35:duration===30?1:duration===90?2.55:5.1);return <button key={region.code} disabled={!enabled} className={`${selected===index?"selected":""} ${!enabled?"unavailable":""}`} onClick={()=>setSelected(index)}><span className="country-flag"><i className={flagClass(region.code)} title={`${region.country}国旗`}/></span><b>{region.country}</b><small>{enabled?region.code:"暂停销售"}</small><em>{enabled?`$${price.toFixed(2)}`:"停售"}</em></button>})}</div></div>}
          {isNode&&<div className="node-global-notice"><span>▣</span><div><b>无需选择地区</b><small>{currentProduct.name} 为全局节点商品，付款后由管理员完成开通。</small></div></div>}
          <div className="config-row">
            <div className="config-block"><div className="config-title"><b>{isNode?"1":"2"}. 选择周期</b><span>{billingCycle==="calendar-month"?"按日历月份计算":"按固定天数计算"}</span></div><div className="duration-options">{(billingCycle==="calendar-month"?[30,90,180]:[7,30,90]).map(day=>{const available=durationAvailable(day);return <button key={day} disabled={!available} className={`${duration===day?"selected":""} ${!available?"unavailable":""}`} onClick={()=>setDuration(day)}><b>{periodText(day)}</b><small>{available?(day===30?"常用":"按需选择"):"暂不出售"}</small></button>})}</div></div>
            <div className="config-block quantity-config"><div className="config-title"><b>{isNode?"2":"3"}. 购买数量</b></div><div><button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button><input value={quantity} onChange={event=>setQuantity(Math.min(500,Math.max(1,Number(event.target.value)||1)))}/><button onClick={()=>setQuantity(Math.min(500,quantity+1))}>＋</button></div></div>
          </div>
          <footer className="unified-checkout-bar"><div><span>当前配置</span><b>{currentProduct.name}{!isNode&&` · ${selectedRegion.country}`} · {periodText(duration)} × {quantity}</b></div><div className="unified-price"><span>参考金额</span><b>${total.toFixed(2)}</b></div>{currentEnabled?<button className="primary add-cart-button" onClick={addToCart}>＋ 加入购物车</button>:<button className="store-disabled-buy" disabled>暂停销售</button>}</footer>
        </div>
      </div>
      <StoreCart inline/>
      </div>
    </section>

    <section id="why" className="section dark"><div className="center"><span className="kicker">为什么选择 YehaoProxy</span><h2>一站式管理网络资源</h2></div><div className="why-grid">{[["多品类资源","代理 IP、软路由中转和电脑节点统一选购。"],["全球地区覆盖","按国家和城市配置适合业务的地区资源。"],["完整客户控制台","订单、资产、余额和售后统一管理。"],["专业客户支持","续费、更换和人工开通流程全程可追踪。"]].map(item => <div key={item[0]}><i>✓</i><h3>{item[0]}</h3><p>{item[1]}</p></div>)}</div></section>
    <section id="faq" className="section faq"><div><span className="kicker">常见问题</span><h2>购买前需要了解什么？</h2><p>完成订单并确认付款后，代理额度或节点服务会进入客户中心。</p><a className="primary" href="/dashboard/support">联系技术支持</a></div><div>{["节点服务如何开通？","支持哪些使用周期？","是否提供售后服务？"].map((question,index) => <details key={question} open={index===0}><summary>{question}<b>＋</b></summary><p>{index===0?"付款后由管理员按照订单地区与配置完成节点开通。":"具体规则会显示在客户中心与售后系统中。"}</p></details>)}</div></section>
    <footer className="site-footer"><a className="brand" href="#">{siteConfig.logoUrl ? <span className="has-logo"><img src={siteConfig.logoUrl} alt="" /></span> : <span>{siteConfig.logoText}</span>} {siteConfig.siteName}</a><p>{siteConfig.footerDescription}</p><div className="site-footer-meta">{siteConfig.companyName && <span>{siteConfig.companyName}</span>}{siteConfig.supportEmail && <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>}{siteConfig.icpNumber && <span>{siteConfig.icpNumber}</span>}</div><small>{siteConfig.copyright}</small></footer>
  </main>;
}
