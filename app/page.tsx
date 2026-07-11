"use client";

import { useMemo, useState } from "react";

const products = [
  { id: "static", name: "静态住宅 ISP", desc: "长期独享固定 IP，适合跨境电商与社媒运营", badge: "最受欢迎" },
  { id: "dynamic", name: "动态住宅代理", desc: "全球真实住宅网络，按流量灵活计费", badge: "覆盖最广" },
  { id: "datacenter", name: "数据中心代理", desc: "高速稳定、低延迟，适合批量业务", badge: "高性价比" },
];

const regions = [
  { flag: "🇺🇸", country: "美国", city: "洛杉矶 / 纽约", price: 3.8, stock: "充足" },
  { flag: "🇬🇧", country: "英国", city: "伦敦", price: 4.2, stock: "充足" },
  { flag: "🇩🇪", country: "德国", city: "法兰克福", price: 4.0, stock: "充足" },
  { flag: "🇯🇵", country: "日本", city: "东京 / 大阪", price: 4.8, stock: "紧张" },
  { flag: "🇸🇬", country: "新加坡", city: "新加坡", price: 4.6, stock: "充足" },
  { flag: "🇭🇰", country: "中国香港", city: "香港", price: 4.5, stock: "充足" },
  { flag: "🇨🇦", country: "加拿大", city: "多伦多", price: 4.1, stock: "充足" },
  { flag: "🇦🇺", country: "澳大利亚", city: "悉尼", price: 4.9, stock: "少量" },
];

export default function Home() {
  const [product, setProduct] = useState("static");
  const [duration, setDuration] = useState(30);
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const multiplier = duration === 7 ? .35 : duration === 30 ? 1 : 2.55;
  const subtotal = useMemo(() => regions[selected].price * quantity * multiplier, [selected, quantity, multiplier]);

  return <main>
    <div className="notice">🎉 新用户首单 9 折 · 企业客户可申请专属线路与批量价格</div>
    <header>
      <a className="brand" href="#"><span>Y</span> YehaoProxy</a>
      <nav><a href="#products">产品</a><a href="#pricing">定价</a><a href="#why">解决方案</a><a href="#faq">帮助中心</a></nav>
      <div className="header-actions"><button className="ghost">登录</button><button className="primary">免费注册</button></div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">全球企业级代理网络</div>
        <h1>稳定、纯净、<em>即买即用</em>的全球 IP</h1>
        <p>覆盖 190+ 国家与地区，为跨境电商、数据采集、品牌保护和社媒运营提供可靠连接。</p>
        <div className="hero-actions"><a className="primary large" href="#pricing">立即选购</a><a className="text-link" href="#why">了解解决方案 →</a></div>
        <div className="metrics"><div><b>80M+</b><span>全球 IP 池</span></div><div><b>99.9%</b><span>网络可用率</span></div><div><b>&lt;0.5s</b><span>平均响应</span></div></div>
      </div>
      <div className="network-card">
        <div className="globe">◎<i className="dot d1"/><i className="dot d2"/><i className="dot d3"/><i className="dot d4"/></div>
        <div className="status"><i/> 全球网络运行正常 <b>99.99%</b></div>
      </div>
    </section>

    <section id="products" className="section soft">
      <div className="section-head"><div><span className="kicker">产品矩阵</span><h2>为每一种业务匹配合适的代理</h2></div><p>HTTP(S) 与 SOCKS5 协议支持，账密和 IP 白名单双重认证。</p></div>
      <div className="product-grid">{products.map((p, i) => <button key={p.id} className={`product-card ${product===p.id ? "active" : ""}`} onClick={() => setProduct(p.id)}>
        <div className={`icon i${i}`}>{i===0?"⌂":i===1?"◉":"⚡"}</div><span className="badge">{p.badge}</span><h3>{p.name}</h3><p>{p.desc}</p><b>查看价格 →</b>
      </button>)}</div>
    </section>

    <section id="pricing" className="section pricing">
      <div className="center"><span className="kicker">透明定价</span><h2>选择你的静态住宅 ISP</h2><p>独享原生 IP · 不限流量 · 到期前持续可用</p></div>
      <div className="benefits"><span>✓ 原生住宅网络</span><span>✓ 独享使用</span><span>✓ 不限流量</span><span>✓ 99.9% 成功率</span><span>✓ 7×24 技术支持</span></div>
      <div className="shop">
        <div className="catalog">
          <div className="tabs">{[7,30,90].map(d=><button key={d} className={duration===d?"on":""} onClick={()=>setDuration(d)}>{d} 天 {d===90&&<small>省 15%</small>}</button>)}</div>
          <div className="region-head"><b>国家 / 地区</b><span>单价</span></div>
          <div className="regions">{regions.map((r,i)=><button key={r.country} className={selected===i?"selected":""} onClick={()=>setSelected(i)}><span className="flag">{r.flag}</span><span><b>{r.country}</b><small>{r.city}</small></span><i className={r.stock==="充足"?"green":"orange"}>{r.stock}</i><strong>${(r.price*multiplier).toFixed(2)}<small>/ IP</small></strong></button>)}</div>
        </div>
        <aside className="checkout"><span className="kicker">订单配置</span><h3>{regions[selected].flag} {regions[selected].country}静态住宅 IP</h3><dl><div><dt>有效期</dt><dd>{duration} 天</dd></div><div><dt>协议</dt><dd>HTTP(S) / SOCKS5</dd></div><div><dt>流量</dt><dd>不限流量</dd></div></dl>
          <label>购买数量</label><div className="stepper"><button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button><input value={quantity} onChange={e=>setQuantity(Math.max(1,Number(e.target.value)||1))}/><button onClick={()=>setQuantity(quantity+1)}>＋</button></div>
          <div className="coupon"><input placeholder="输入优惠码"/><button>使用</button></div>
          <div className="total"><span>应付总额<small>已含税费（如适用）</small></span><b>${subtotal.toFixed(2)}</b></div>
          <button className="primary buy" onClick={()=>alert("结算系统待接入支付渠道后启用")}>安全结算 →</button><p className="secure">🔒 加密支付 · 支持订单退款保障</p>
        </aside>
      </div>
    </section>

    <section id="why" className="section dark"><div className="center"><span className="kicker">为什么选择 YehaoProxy</span><h2>把网络基础设施交给我们</h2></div><div className="why-grid">{[["◈","纯净 IP 资源","严格筛选并持续监测线路质量，降低业务风控概率。"],["↗","全球低延迟网络","智能路由自动选择优质链路，全球业务都能快速响应。"],["⌁","灵活 API 接入","清晰的开发文档与 API，轻松集成到现有工作流。"],["♧","专业客户支持","7×24 小时响应，为企业提供迁移与接入协助。"]].map(x=><div key={x[1]}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p></div>)}</div></section>

    <section id="faq" className="section faq"><div><span className="kicker">常见问题</span><h2>购买前需要了解什么？</h2><p>还有问题？联系我们的技术顾问获取一对一方案。</p><button className="primary">联系售前顾问</button></div><div>{["购买后多久可以使用？","支持哪些认证方式和协议？","是否支持更换或退款？","大量采购是否有折扣？"].map((q,i)=><details key={q} open={i===0}><summary>{q}<b>＋</b></summary><p>{i===0?"支付成功后，IP 信息将自动发放至用户中心，同时发送订单通知。":"具体政策会根据产品类型和订单情况展示在结算页面。"}</p></details>)}</div></section>

    <footer><a className="brand" href="#"><span>Y</span> YehaoProxy</a><p>可靠的全球代理基础设施，让每一次连接都更简单。</p><div className="footer-links"><a>产品</a><a>价格</a><a>服务条款</a><a>隐私政策</a><a>可接受使用政策</a></div><small>© 2026 YehaoProxy. All rights reserved.</small></footer>
  </main>;
}
