"use client";

import {useEffect, useState} from "react";
import {useSearchParams} from "next/navigation";

const names: Record<string, string> = {
  "static-isp": "静态住宅 ISP",
  residential: "动态住宅代理",
  datacenter: "数据中心代理",
  mobile: "移动代理",
  "soft-router": "软路由中转",
  "computer-node": "电脑节点",
};

export default function Buy() {
  const query = useSearchParams();
  const [logged, setLogged] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const product = query.get("product") || "static-isp";
  const region = (query.get("region") || "US").toUpperCase();
  const durationDays = Number(query.get("duration") || 30);
  const quantity = Number(query.get("quantity") || 1);
  const isNode = ["soft-router", "computer-node"].includes(product);

  useEffect(() => {
    fetch("/api/auth/me").then(response => setLogged(response.ok));
  }, []);

  async function create() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({product, region, durationDays, quantity}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error + (data.available !== undefined ? `（当前可售 ${data.available} 份）` : ""));
      return;
    }
    location.href = "/dashboard/orders";
  }

  return <main className="auth-page">
    <section className="auth-brand"><a className="brand" href="/"><span>Y</span> YehaoProxy</a><div><span className="kicker">ORDER REVIEW</span><h1>确认商品订单</h1><p>{isNode ? "节点订单付款后由管理员按地区和配置完成开通。" : "付款后获得对应地区的待提取额度。"}</p></div></section>
    <section className="auth-form-wrap"><div className="auth-form"><h2>订单配置</h2><dl><div><dt>商品类目</dt><dd>{isNode ? "节点服务" : "代理 IP"}</dd></div><div><dt>产品</dt><dd>{names[product] || product}</dd></div>{!isNode&&<div><dt>地区</dt><dd>{region}</dd></div>}<div><dt>有效期</dt><dd>{durationDays} 天</dd></div><div><dt>数量</dt><dd>{quantity} {isNode ? "个" : "条"}</dd></div></dl><p>订单金额按后台商品中心配置计算，创建订单前不会扣款。</p>{error && <div className="auth-error">{error}</div>}{logged === false ? <><div className="auth-error">请先登录或注册，再提交订单。</div><a className="primary auth-submit" href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>登录后继续</a><a className="ghost auth-submit" href="/register">注册账户</a></> : <button className="primary auth-submit" disabled={loading || logged === null} onClick={create}>{loading ? "正在创建订单…" : "创建待支付订单"}</button>}<div className="auth-foot"><a href="/#pricing">← 返回修改配置</a></div></div></section>
  </main>;
}
