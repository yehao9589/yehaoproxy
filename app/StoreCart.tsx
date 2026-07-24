"use client";

import {useEffect, useMemo, useState} from "react";
import "./store-cart.css";

export type CartItem = {product: string; productName: string; region: string; regionName: string; durationDays: number; quantity: number; unitEstimate: number};
const STORAGE_KEY = "yehaoproxy-cart-v1";

export function addStoreCartItem(item: CartItem) {
  window.dispatchEvent(new CustomEvent<CartItem>("store-cart-add", {detail: item}));
}

export default function StoreCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    if (!items.length) return;
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/orders/batch", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({items}),
    });
    const data = await response.json();
    setSubmitting(false);
    if (response.status === 401) {
      location.href = `/login?next=${encodeURIComponent("/#products")}`;
      return;
    }
    if (!response.ok) return setMessage(data.error || "结算失败");
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
    location.href = "/dashboard/orders";
  }

  return <>
    <button className="floating-cart" onClick={() => setOpen(true)} aria-label="打开购物车"><span>🛒</span><b>购物车</b>{count > 0 && <em>{count}</em>}</button>
    {open && <div className="cart-mask" onMouseDown={event => {if (event.target === event.currentTarget) setOpen(false)}}>
      <aside className="cart-drawer">
        <header><div><span>SHOPPING CART</span><h2>购物车</h2></div><button onClick={() => setOpen(false)}>×</button></header>
        {message && <div className={message === "已加入购物车" ? "cart-ok" : "cart-error"}>{message}</div>}
        <div className="cart-items">{items.length === 0 ? <div className="cart-empty"><span>🛒</span><b>购物车还是空的</b><small>选择商品、地区和数量后加入购物车</small></div> : items.map((item, index) => <article key={`${item.product}-${item.region}-${item.durationDays}`}><div><b>{item.productName}</b><small>{item.regionName} · {item.durationDays} 天</small></div><div className="cart-qty"><button onClick={() => update(index, item.quantity - 1)}>−</button><b>{item.quantity}</b><button onClick={() => update(index, item.quantity + 1)}>＋</button></div><button className="cart-remove" onClick={() => remove(index)}>删除</button></article>)}</div>
        <footer><div><span>共 {count} 件商品</span><b>参考 ${estimate.toFixed(2)}</b></div><button className="primary" disabled={!items.length || submitting} onClick={checkout}>{submitting ? "正在创建订单…" : `结算购物车（${items.length} 项）`}</button><small>结算后将按购物车项目分别生成待支付订单</small></footer>
      </aside>
    </div>}
  </>;
}
