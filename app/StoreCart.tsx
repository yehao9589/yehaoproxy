"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import "./store-cart.css";
import CountryMark from "./components/CountryMark";
import ConsoleIcon from "./components/ConsoleIcon";

export type CartItem = {product: string; productName: string; region: string; regionName: string; durationDays: number; billingCycle?:"fixed-days"|"calendar-month"; quantity: number; unitEstimate: number};
const STORAGE_KEY = "yehaoproxy-cart-v1";

export function addStoreCartItem(item: CartItem) {
  window.dispatchEvent(new CustomEvent<CartItem>("store-cart-add", {detail: item}));
}

export default function StoreCart({inline = false}: {inline?: boolean}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkoutPending = useRef(false);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setItems(saved);
    } catch {}
    const onAdd = (event: Event) => {
      const item = (event as CustomEvent<CartItem>).detail;
      setItems(current => {
        const index = current.findIndex(existing => existing.product === item.product && existing.region === item.region && existing.durationDays === item.durationDays);
        const next = index < 0 ? [...current, item] : current.map((existing, i) => i === index ? {...existing, quantity: Math.min(500, existing.quantity + item.quantity)} : existing);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setMessage("已加入购物车");
      setOpen(true);
      window.setTimeout(() => setMessage(""), 1800);
    };
    window.addEventListener("store-cart-add", onAdd);
    return () => window.removeEventListener("store-cart-add", onAdd);
  }, []);

  function update(index: number, quantity: number) {
    const next = items.map((item, i) => i === index ? {...item, quantity: Math.min(500, Math.max(1, quantity))} : item);
    setItems(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  function remove(index: number) {
    const next = items.filter((_, i) => i !== index);
    setItems(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const estimate = useMemo(() => items.reduce((sum, item) => sum + item.unitEstimate * item.quantity, 0), [items]);

  async function checkout() {
    if (!items.length || checkoutPending.current) return;
    checkoutPending.current = true;
    setSubmitting(true); setMessage("");
    try {
      const response = await fetch("/api/orders/batch", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({items}),
      });
      if (response.status === 401) {
        setAuthRequired(true);
        setMessage("结算前请先登录或注册账户");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(typeof data?.error === "string" ? data.error : "结算失败");
        return;
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setItems([]);
      location.href = "/dashboard?tab=orders";
    } catch {
      setMessage("未能确认结算结果，请先到订单管理核对后再重试。");
    } finally {
      checkoutPending.current = false;
      setSubmitting(false);
    }
  }

  const cartPanel = <aside className={`cart-drawer ${inline ? "inline" : ""}`}>
    <header><div><span>购物清单</span><h2>购物车</h2></div>{!inline && <button onClick={() => setOpen(false)}>×</button>}</header>
    {message && <div className={message === "已加入购物车" ? "cart-ok" : "cart-error"} role={message === "已加入购物车" ? "status" : "alert"}>{message}</div>}
    {authRequired && <div className="cart-auth-guide"><p>登录后购物车商品会继续保留，可直接回来完成结算。</p><div><a data-ui="action" data-ui-tone="primary" className="primary" href={`/login?next=${encodeURIComponent("/#products")}`}>去登录</a><a href={`/register?next=${encodeURIComponent("/#products")}`}>免费注册</a></div></div>}
    <div className="cart-items">{items.length === 0 ? <div className="cart-empty"><span><ConsoleIcon name="cart" width={26} height={26}/></span><b>购物车还是空的</b><small>选择商品、地区和数量后加入购物车</small></div> : items.map((item, index) => {const isGlobal=item.region==="GLOBAL",period=item.billingCycle==="calendar-month"?`${Math.max(1,Math.round(item.durationDays/30))} 个自然月`:`${item.durationDays} 天`;return <article key={`${item.product}-${item.region}-${item.durationDays}`}><div className="cart-product">{<CountryMark country={item.region}/>}<div><b>{item.productName}</b><small><span>{item.regionName}</span>{!isGlobal&&<em>{item.region}</em>} · {period}</small></div></div><div className="cart-qty"><button onClick={() => update(index, item.quantity - 1)}>−</button><b>{item.quantity}</b><button onClick={() => update(index, item.quantity + 1)}>＋</button></div><button className="cart-remove" onClick={() => remove(index)}>删除</button></article>})}</div>
    <footer><div><span>共 {count} 件商品</span><b>参考 ${estimate.toFixed(2)}</b></div><button data-ui="action" data-ui-tone="primary" className="primary" disabled={!items.length || submitting} onClick={checkout}>{submitting ? "正在创建订单…" : `结算购物车（${items.length} 项）`}</button><small>结算后将按购物车项目分别生成待支付订单</small></footer>
  </aside>;

  if (inline) return <div className="inline-cart-shell">{cartPanel}</div>;

  return <>
    <button className="floating-cart" onClick={() => setOpen(true)} aria-label="打开购物车"><span>🛒</span><b>购物车</b>{count > 0 && <em>{count}</em>}</button>
    {open && <div className="cart-mask" onMouseDown={event => {if (event.target === event.currentTarget) setOpen(false)}}>
      {cartPanel}
    </div>}
  </>;
}
