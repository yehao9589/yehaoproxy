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
};

type EditableOffer = Pick<Offer, "price7" | "price30" | "price90" | "saleStock">;
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

function draftOf(item: Offer): EditableOffer {
  return {
    price7: item.price7,
    price30: item.price30,
    price90: item.price90,
    saleStock: item.saleStock,
  };
}

export default function ProductOffersModule() {
  const [items, setItems] = useState<Offer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditableOffer>>({});
  const [category, setCategory] = useState<Category>("all");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/products");
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "商品加载失败");
      return;
    }
    setItems(data.items);
    setDrafts(Object.fromEntries(data.items.map((item: Offer) => [item.id, draftOf(item)])));
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(
    () => items.filter(item => category === "all" || categoryOf(item.product) === category),
    [items, category],
  );

  function updateDraft(id: string, key: keyof EditableOffer, value: number) {
    setDrafts(current => ({
      ...current,
      [id]: {...current[id], [key]: value},
    }));
  }

  function isDirty(item: Offer) {
    const draft = drafts[item.id];
    return Boolean(draft && (
      draft.price7 !== item.price7 ||
      draft.price30 !== item.price30 ||
      draft.price90 !== item.price90 ||
      draft.saleStock !== item.saleStock
    ));
  }

  async function savePrices(item: Offer) {
    const body = drafts[item.id];
    if (!body) return;
    if (![body.price7, body.price30, body.price90].every(value => Number.isFinite(value) && value > 0)) {
      setError("周期价格必须大于 0");
      return;
    }
    if (!Number.isInteger(body.saleStock) || body.saleStock < 0) {
      setError("销售额度必须是非负整数");
      return;
    }
    setSaving(item.id);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/admin/products/${item.id}`, {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) {
      setError(data.error || "保存失败");
      return;
    }
    await load();
    setSuccess(`${names[item.product] || item.product} · ${item.regionName} 的价格与额度已保存`);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function toggle(item: Offer) {
    setSaving(item.id);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/admin/products/${item.id}`, {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({enabled: !item.enabled}),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) {
      setError(data.error || "操作失败");
      return;
    }
    await load();
    setSuccess(`${names[item.product] || item.product} 已${item.enabled ? "下架" : "上架"}`);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("create");
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/admin/products", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) {
      setError(data.error || "新增商品失败");
      return;
    }
    const productName = names[String(body.product)] || String(body.product);
    setOpen(false);
    form.reset();
    await load();
    setSuccess(`${productName}销售配置已创建`);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  return (
    <div className="business-page product-offers-page">
      {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
      {success && <div className="offer-success"><span>✓</span>{success}</div>}

      <div className="business-kpis">
        <article><span>商品地区</span><b>{items.length}</b><small>独立销售配置</small></article>
        <article><span>剩余可售额度</span><b>{items.reduce((n, x) => n + Math.max(0, x.saleStock - x.sold), 0)}</b><small>不读取库存中心</small></article>
        <article><span>电脑节点</span><b>{items.filter(x => categoryOf(x.product) === "node").length}</b><small>节点销售配置</small></article>
        <article><span>在售配置</span><b>{items.filter(x => x.enabled).length}</b><small>前台可购买</small></article>
      </div>

      <div className="business-card">
        <header>
          <div>
            <h2>前台商品与销售额度</h2>
            <p>按商品分类管理周期价格和销售额度；修改后点击该行“保存更改”才会生效。</p>
          </div>
          <button className="primary" onClick={() => setOpen(true)}>＋ 添加商品配置</button>
        </header>

        <div className="offer-category-tabs" aria-label="商品分类">
          <button className={category === "all" ? "on" : ""} onClick={() => setCategory("all")}>全部商品 <b>{items.length}</b></button>
          <button className={category === "proxy" ? "on" : ""} onClick={() => setCategory("proxy")}>代理 IP <b>{items.filter(x => categoryOf(x.product) === "proxy").length}</b></button>
          <button className={category === "node" ? "on" : ""} onClick={() => setCategory("node")}>电脑节点 <b>{items.filter(x => categoryOf(x.product) === "node").length}</b></button>
        </div>

        <div className="business-table product offer-table">
          <div className="brow head">
            <span>分类 / 商品 / 地区</span><span>7 天价</span><span>30 天价</span>
            <span>90 天价</span><span>销售额度</span><span>剩余</span><span>操作</span>
          </div>
          {visibleItems.map(item => {
            const draft = drafts[item.id] || draftOf(item);
            const dirty = isDirty(item);
            return (
              <div className={`brow ${dirty ? "is-dirty" : ""}`} key={item.id}>
                <span className="offer-identity">
                  <em>{categoryOf(item.product) === "node" ? "电脑节点" : "代理 IP"}</em>
                  <b>{names[item.product] || item.product}</b>
                  <small>{item.regionName} · {item.region}</small>
                </span>
                {(["price7", "price30", "price90"] as const).map(key => (
                  <span key={key}>
                    <label className="offer-money"><i>$</i><input type="number" min="0.01" step="0.01" value={draft[key]} onChange={event => updateDraft(item.id, key, Number(event.target.value))}/></label>
                  </span>
                ))}
                <span><input className="offer-input" type="number" min="0" step="1" value={draft.saleStock} onChange={event => updateDraft(item.id, "saleStock", Number(event.target.value))}/></span>
                <span className="positive">{Math.max(0, item.saleStock - item.sold)}</span>
                <span className="offer-row-actions">
                  <button className="offer-save" disabled={!dirty || saving === item.id} onClick={() => void savePrices(item)}>
                    {saving === item.id ? "保存中…" : dirty ? "保存更改" : "已保存"}
                  </button>
                  <button className={item.enabled ? "offer-on" : "offer-off"} disabled={saving === item.id} onClick={() => void toggle(item)}>
                    {item.enabled ? "在售" : "已下架"}
                  </button>
                </span>
              </div>
            );
          })}
          {visibleItems.length === 0 && <div className="offer-empty">该分类暂无商品配置，请点击右上角添加。</div>}
        </div>
      </div>

      {open && (
        <div className="modal">
          <form onSubmit={create}>
            <div><h2>添加商品销售配置</h2><button type="button" onClick={() => setOpen(false)}>×</button></div>
            <div className="form-grid">
              <label>商品分类<select name="category" defaultValue="proxy"><option value="proxy">代理 IP</option><option value="node">电脑节点</option></select></label>
              <label>具体商品<select name="product" defaultValue="static-isp">
                <optgroup label="代理 IP">
                  <option value="static-isp">静态住宅 ISP</option>
                  <option value="residential">动态住宅代理</option>
                  <option value="datacenter">数据中心代理</option>
                  <option value="mobile">移动代理</option>
                </optgroup>
                <optgroup label="电脑节点">
                  <option value="computer-node">电脑节点</option>
                </optgroup>
              </select></label>
              <label>国家代码<input name="region" maxLength={2} required placeholder="US"/></label>
              <label>地区名称<input name="regionName" required placeholder="美国 / 弗吉尼亚"/></label>
              <label>7 天单价<input name="price7" type="number" min="0.01" step="0.01" required/></label>
              <label>30 天单价<input name="price30" type="number" min="0.01" step="0.01" required/></label>
              <label>90 天单价<input name="price90" type="number" min="0.01" step="0.01" required/></label>
              <label>前台销售额度<input name="saleStock" type="number" min="0" required/></label>
              <label>排序<input name="sortOrder" type="number" defaultValue="100"/></label>
            </div>
            <footer>
              <button type="button" onClick={() => setOpen(false)}>取消</button>
              <button className="primary" disabled={saving === "create"}>{saving === "create" ? "正在保存…" : "保存商品"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
