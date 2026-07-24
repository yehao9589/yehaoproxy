"use client";

import {useEffect, useMemo, useState} from "react";
import "./product-offers.css";

type Offer = {
  id: string;
  product: string;
  region: string;
  regionName: string;
  price7: number;
  price30: number;
  price90: number;
  saleStock: number;
  sold: number;
  enabled: boolean;
  sortOrder: number;
};

type Category = "all" | "proxy" | "node";

const names: Record<string, string> = {
  "static-isp": "静态住宅 ISP",
  residential: "动态住宅代理",
  datacenter: "数据中心代理",
  mobile: "移动代理",
  "computer-node": "电脑节点",
};

const categoryOf = (product: string): Exclude<Category, "all"> =>
  product === "computer-node" ? "node" : "proxy";

export default function ProductOffersModule() {
  const [items, setItems] = useState<Offer[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/products");
    const data = await response.json();
    if (!response.ok) return setError(data.error || "商品加载失败");
    setItems(data.items);
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(
    () => items.filter(item => category === "all" || categoryOf(item.product) === category),
    [items, category],
  );

  function showSuccess(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const isEdit = Boolean(editing);
    const url = isEdit ? `/api/admin/products/${editing!.id}` : "/api/admin/products";
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setError(data.error || "保存失败");
    setCreating(false);
    setEditing(null);
    await load();
    showSuccess(isEdit ? "商品信息已保存，前台销售配置已同步更新" : "商品销售配置已创建");
  }

  async function toggle(item: Offer) {
    setError("");
    const response = await fetch(`/api/admin/products/${item.id}`, {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({enabled: !item.enabled}),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "操作失败");
    await load();
    showSuccess(`${names[item.product] || item.product} 已${item.enabled ? "下架" : "上架"}`);
  }

  return (
    <div className="business-page product-offers-page">
      {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
      {success && <div className="offer-success"><span>✓</span>{success}</div>}

      <div className="business-kpis">
        <article><span>商品配置</span><b>{items.length}</b><small>地区独立定价</small></article>
        <article><span>剩余可售额度</span><b>{items.reduce((n, x) => n + Math.max(0, x.saleStock - x.sold), 0)}</b><small>不读取库存中心</small></article>
        <article><span>电脑节点</span><b>{items.filter(x => categoryOf(x.product) === "node").length}</b><small>节点销售配置</small></article>
        <article><span>在售配置</span><b>{items.filter(x => x.enabled).length}</b><small>前台可购买</small></article>
      </div>

      <div className="business-card">
        <header>
          <div>
            <h2>商品管理</h2>
            <p>通过“编辑商品”统一修改类型、地区、周期价格、销售额度和排序。</p>
          </div>
          <button className="primary" onClick={() => setCreating(true)}>＋ 添加商品</button>
        </header>

        <div className="offer-category-tabs" aria-label="商品分类">
          <button className={category === "all" ? "on" : ""} onClick={() => setCategory("all")}>全部商品 <b>{items.length}</b></button>
          <button className={category === "proxy" ? "on" : ""} onClick={() => setCategory("proxy")}>代理 IP <b>{items.filter(x => categoryOf(x.product) === "proxy").length}</b></button>
          <button className={category === "node" ? "on" : ""} onClick={() => setCategory("node")}>电脑节点 <b>{items.filter(x => categoryOf(x.product) === "node").length}</b></button>
        </div>

        <div className="business-table product offer-table offer-readonly-table">
          <div className="brow head">
            <span>分类 / 商品</span><span>地区</span><span>7 天价</span><span>30 天价</span>
            <span>90 天价</span><span>额度 / 剩余</span><span>操作</span>
          </div>
          {visibleItems.map(item => (
            <div className="brow" key={item.id}>
              <span className="offer-identity">
                <em>{categoryOf(item.product) === "node" ? "电脑节点" : "代理 IP"}</em>
                <b>{names[item.product] || item.product}</b>
              </span>
              <span><b>{item.regionName}</b><small>{item.region}</small></span>
              <span className="offer-price">${item.price7.toFixed(2)}</span>
              <span className="offer-price">${item.price30.toFixed(2)}</span>
              <span className="offer-price">${item.price90.toFixed(2)}</span>
              <span><b>{item.saleStock}</b><small>剩余 {Math.max(0, item.saleStock - item.sold)}</small></span>
              <span className="offer-row-actions">
                <button className="offer-edit" onClick={() => setEditing(item)}>编辑商品</button>
                <button className={item.enabled ? "offer-on" : "offer-off"} onClick={() => void toggle(item)}>{item.enabled ? "在售" : "已下架"}</button>
              </span>
            </div>
          ))}
          {visibleItems.length === 0 && <div className="offer-empty">该分类暂无商品，请点击右上角添加。</div>}
        </div>
      </div>

      {(creating || editing) && (
        <div className="modal">
          <form onSubmit={submit}>
            <div><h2>{editing ? "编辑商品" : "添加商品"}</h2><button type="button" onClick={() => {setCreating(false); setEditing(null);}}>×</button></div>
            <div className="form-grid">
              <label>商品类型<select name="product" defaultValue={editing?.product || "static-isp"}>
                <optgroup label="代理 IP">
                  <option value="static-isp">静态住宅 ISP</option>
                  <option value="residential">动态住宅代理</option>
                  <option value="datacenter">数据中心代理</option>
                  <option value="mobile">移动代理</option>
                </optgroup>
                <optgroup label="电脑节点"><option value="computer-node">电脑节点</option></optgroup>
              </select></label>
              <label>国家 / 地区代码<input name="region" maxLength={2} required defaultValue={editing?.region || ""} placeholder="US"/></label>
              <label>地区名称<input name="regionName" required defaultValue={editing?.regionName || ""} placeholder="美国 / 弗吉尼亚"/></label>
              <label>7 天单价<input name="price7" type="number" min="0.01" step="0.01" required defaultValue={editing?.price7}/></label>
              <label>30 天单价<input name="price30" type="number" min="0.01" step="0.01" required defaultValue={editing?.price30}/></label>
              <label>90 天单价<input name="price90" type="number" min="0.01" step="0.01" required defaultValue={editing?.price90}/></label>
              <label>前台销售额度<input name="saleStock" type="number" min="0" step="1" required defaultValue={editing?.saleStock}/></label>
              <label>显示排序<input name="sortOrder" type="number" step="1" defaultValue={editing?.sortOrder ?? 100}/></label>
            </div>
            <p className="modal-note">保存后会立即更新商品中心配置；已产生的历史订单不会修改。</p>
            <footer>
              <button type="button" onClick={() => {setCreating(false); setEditing(null);}}>取消</button>
              <button className="primary" disabled={saving}>{saving ? "保存中…" : "保存更改"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
