"use client";

import {useMemo, useState} from "react";
import "./storefront-products.css";

const regions = [
  {code: "US", flag: "🇺🇸", country: "美国", city: "洛杉矶 / 纽约", price: 3.8},
  {code: "GB", flag: "🇬🇧", country: "英国", city: "伦敦", price: 4.2},
  {code: "DE", flag: "🇩🇪", country: "德国", city: "法兰克福", price: 4},
  {code: "JP", flag: "🇯🇵", country: "日本", city: "东京 / 大阪", price: 4.8},
  {code: "SG", flag: "🇸🇬", country: "新加坡", city: "新加坡", price: 4.6},
  {code: "HK", flag: "🇭🇰", country: "中国香港", city: "香港", price: 4.5},
];

const products = [
  {id: "static-isp", category: "proxy", name: "静态住宅 ISP", desc: "长期独享固定 IP，适合跨境电商和社媒运营"},
  {id: "residential", category: "proxy", name: "动态住宅代理", desc: "全球真实住宅网络，灵活用于数据与业务访问"},
  {id: "datacenter", category: "proxy", name: "数据中心代理", desc: "高速、稳定、低延迟，适合批量业务"},
  {id: "soft-router", category: "node", name: "软路由中转", desc: "提供稳定中转与路由环境，适合多设备统一连接"},
  {id: "computer-node", category: "node", name: "电脑节点", desc: "独享远程电脑环境，按地区和使用周期灵活购买"},
] as const;

type ProductCategory = "proxy" | "node";

export default function Home() {
  const [category, setCategory] = useState<ProductCategory>("proxy");
  const [product, setProduct] = useState("static-isp");
  const [duration, setDuration] = useState(30);
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const multiplier = duration === 7 ? .35 : duration === 30 ? 1 : 2.55;
  const total = useMemo(() => (category === "node" ? 29.9 : regions[selected].price) * quantity * multiplier, [category, selected, quantity, multiplier]);
  const visibleProducts = products.filter(item => item.category === category);
  const currentProduct = products.find(item => item.id === product)!;
  const isNode = currentProduct.category === "node";
  const orderRegion = isNode ? "GLOBAL" : regions[selected].code;
  const buy = `/buy?product=${product}&region=${orderRegion}&duration=${duration}&quantity=${quantity}`;

  function chooseCategory(next: ProductCategory) {
    setCategory(next);
    const first = products.find(item => item.category === next);
    if (first) setProduct(first.id);
  }

  return <main>
    <div className="notice">新用户专享优惠 · 企业客户可申请专属线路与批量价格</div>
    <header><a className="brand" href="#"><span>Y</span> YehaoProxy</a><nav><a href="#products">产品</a><a href="#pricing">定价</a><a href="#why">解决方案</a><a href="#faq">帮助中心</a></nav><div className="header-actions"><a className="ghost" href="/login">登录</a><a className="primary" href="/register">免费注册</a></div></header>

    <section className="hero"><div className="hero-copy"><div className="eyebrow">全球企业级网络服务</div><h1>稳定、纯净、<em>即买即用</em>的网络资源</h1><p>为跨境电商、数据业务、远程办公和多设备运营提供可靠连接。</p><div className="hero-actions"><a className="primary large" href="#pricing">立即选购</a><a className="text-link" href="#products">查看产品 →</a></div><div className="metrics"><div><b>80M+</b><span>全球 IP 池</span></div><div><b>99.9%</b><span>网络可用率</span></div><div><b>7×24</b><span>售后支持</span></div></div></div><div className="network-card"><div className="globe">◎<i className="dot d1"/><i className="dot d2"/><i className="dot d3"/></div><div className="status"><i/> 全球网络运行正常 <b>99.99%</b></div></div></section>

    <section id="products" className="section soft">
      <div className="section-head"><div><span className="kicker">产品矩阵</span><h2>代理网络与节点服务</h2></div><p>代理 IP 和节点服务分区展示，快速找到适合业务的产品。</p></div>
      <div className="store-category-tabs">
        <button className={category === "proxy" ? "on" : ""} onClick={() => chooseCategory("proxy")}><span>◫</span><b>代理 IP</b><small>住宅、机房与动态代理</small></button>
        <button className={category === "node" ? "on" : ""} onClick={() => chooseCategory("node")}><span>▣</span><b>节点服务</b><small>软路由中转与电脑节点</small></button>
      </div>
      <div className={`product-grid ${category === "node" ? "node-products" : ""}`}>{visibleProducts.map((item, index) => <button key={item.id} className={`product-card ${product === item.id ? "active" : ""}`} onClick={() => setProduct(item.id)}><div className={`icon i${index}`}>{item.category === "node" ? "▣" : "◫"}</div><span className="product-type-tag">{item.category === "node" ? "节点服务" : "代理 IP"}</span><h3>{item.name}</h3><p>{item.desc}</p><b>{product === item.id ? "已选择" : "选择此产品 →"}</b></button>)}</div>
      {category === "node" && <div className="node-quick-checkout">
        <div className="node-quick-summary"><span>当前选择</span><b>{currentProduct.name}</b><small>无需选择地区 · 付款后管理员人工开通</small></div>
        <div className="node-quick-field"><label>使用周期</label><div>{[7,30,90].map(day=><button key={day} className={duration===day?"on":""} onClick={()=>setDuration(day)}>{day} 天</button>)}</div></div>
        <div className="node-quick-field quantity"><label>购买数量</label><div><button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button><b>{quantity}</b><button onClick={()=>setQuantity(Math.min(500,quantity+1))}>＋</button></div></div>
        <div className="node-quick-total"><span>参考金额</span><b>${total.toFixed(2)}</b><small>实际价格按后台商品配置</small></div>
        <a className="primary node-quick-buy" href={buy}>立即购买 {currentProduct.name}</a>
      </div>}
    </section>

    <section id="pricing" className="section pricing">
      <div className="center"><span className="kicker">透明定价</span><h2>配置你的订单</h2><p>实际订单价格以前台商品中心配置为准</p></div>
      <div className="benefits"><span>✓ 独享使用</span><span>✓ 商品直接选择</span><span>✓ 多周期支持</span><span>✓ 售后服务</span><span>✓ 7×24 工单支持</span></div>
      <div className="shop"><div className="catalog"><div className="selected-product-banner"><span>{isNode ? "节点服务" : "代理 IP"}</span><b>{currentProduct.name}</b><button onClick={() => document.getElementById("products")?.scrollIntoView()}>更换产品</button></div><div className="tabs">{[7,30,90].map(day => <button key={day} className={duration === day ? "on" : ""} onClick={() => setDuration(day)}>{day} 天</button>)}</div>{isNode?<div className="node-no-region"><span>▣</span><div><b>{currentProduct.name}</b><small>节点服务无需选择国家或地区，付款后由管理员统一开通。</small></div></div>:<><div className="region-head"><b>国家 / 地区</b><span>参考单价</span></div><div className="regions">{regions.map((region,index) => <button key={region.code} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}><span className="flag">{region.flag}</span><span><b>{region.country}</b><small>{region.city}</small></span><i className="green">可选</i><strong>${(region.price*multiplier).toFixed(2)}<small>/ IP</small></strong></button>)}</div></>}</div><aside className="checkout"><span className="kicker">订单配置</span><h3>{isNode?currentProduct.name:<>{regions[selected].flag} {regions[selected].country} · {currentProduct.name}</>}</h3><dl><div><dt>商品类目</dt><dd>{isNode ? "节点服务" : "代理 IP"}</dd></div>{!isNode&&<div><dt>地区</dt><dd>{regions[selected].country}</dd></div>}<div><dt>有效期</dt><dd>{duration} 天</dd></div><div><dt>交付方式</dt><dd>{isNode ? "后台人工开通" : "额度提取"}</dd></div></dl><label>购买数量</label><div className="stepper"><button onClick={() => setQuantity(Math.max(1,quantity-1))}>−</button><input value={quantity} onChange={event => setQuantity(Math.min(500,Math.max(1,Number(event.target.value)||1)))}/><button onClick={() => setQuantity(Math.min(500,quantity+1))}>＋</button></div><div className="total"><span>参考金额<small>结算时按商品配置计算</small></span><b>${total.toFixed(2)}</b></div><a className="primary buy" href={buy}>创建订单 →</a><p className="secure">余额支付 · 后台可人工确认 · 售后可追踪</p></aside></div>
    </section>

    <section id="why" className="section dark"><div className="center"><span className="kicker">为什么选择 YehaoProxy</span><h2>一站式管理网络资源</h2></div><div className="why-grid">{[["多品类资源","代理 IP、软路由中转和电脑节点统一选购。"],["全球地区覆盖","按国家和城市配置适合业务的地区资源。"],["完整客户控制台","订单、资产、余额和售后统一管理。"],["专业客户支持","续费、更换和人工开通流程全程可追踪。"]].map(item => <div key={item[0]}><i>✓</i><h3>{item[0]}</h3><p>{item[1]}</p></div>)}</div></section>
    <section id="faq" className="section faq"><div><span className="kicker">常见问题</span><h2>购买前需要了解什么？</h2><p>完成订单并确认付款后，代理额度或节点服务会进入客户中心。</p><a className="primary" href="/dashboard/support">联系技术支持</a></div><div>{["节点服务如何开通？","支持哪些使用周期？","是否提供售后服务？"].map((question,index) => <details key={question} open={index===0}><summary>{question}<b>＋</b></summary><p>{index===0?"付款后由管理员按照订单地区与配置完成节点开通。":"具体规则会显示在客户中心与售后系统中。"}</p></details>)}</div></section>
    <footer><a className="brand" href="#"><span>Y</span> YehaoProxy</a><p>可靠的全球代理与节点服务，让每一次连接都更简单。</p><small>© 2026 YehaoProxy. All rights reserved.</small></footer>
  </main>;
}
