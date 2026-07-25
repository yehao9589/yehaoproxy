"use client";

import {useEffect, useMemo, useState} from "react";
import "./product-offers.css";
import { countries, countryFlag, countryName } from "../../lib/countries";

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
type ProductType = {id:string;name:string;category:"proxy"|"node";description:string;enabled:boolean;sortOrder:number};

function CountryPicker({defaultValue}:{defaultValue:string}) {
  const initial=countries.find(item=>item.code===defaultValue)||{code:defaultValue,name:countryName(defaultValue),flag:countryFlag(defaultValue)};
  const [selected,setSelected]=useState(initial);
  const [query,setQuery]=useState(`${initial.flag} ${initial.name}（${initial.code}）`);
  const [open,setOpen]=useState(false);
  const searchText=open?query.replace(/^\S+\s*/,"").replace(/（[A-Z]{2}）$/,"").trim():query;
  const normalized=searchText.toLocaleLowerCase("zh-CN");
  const filtered=normalized
    ? countries.filter(item=>item.code.toLowerCase().includes(normalized)||item.name.toLocaleLowerCase("zh-CN").includes(normalized))
    : countries;
  return <label className="country-picker">
    国家 / 地区
    <input type="hidden" name="region" value={selected.code}/>
    <div className={`country-combobox ${open?"open":""}`}>
      <span className="country-search-icon">⌕</span>
      <input role="combobox" aria-expanded={open} aria-autocomplete="list" value={query}
        onFocus={()=>{setOpen(true);setQuery("")}}
        onChange={event=>{setQuery(event.target.value);setOpen(true)}}
        onBlur={()=>window.setTimeout(()=>{setOpen(false);setQuery(`${selected.flag} ${selected.name}（${selected.code}）`)},150)}
        placeholder="输入国家名称或代码，例如：美国 / US"/>
      <button type="button" className="country-arrow" aria-label="展开国家列表" onMouseDown={event=>event.preventDefault()} onClick={()=>setOpen(value=>{if(!value)setQuery("");return !value})}><span/></button>
      {open&&<div className="country-options" role="listbox">
        <small>{filtered.length ? `找到 ${filtered.length} 个国家或地区` : "没有匹配的国家或地区"}</small>
        {filtered.slice(0,80).map(item=><button type="button" role="option" aria-selected={item.code===selected.code} key={item.code}
          onMouseDown={event=>event.preventDefault()}
          onClick={()=>{setSelected(item);setQuery(`${item.flag} ${item.name}（${item.code}）`);setOpen(false)}}>
          <span>{item.flag}</span><b>{item.name}</b><em>{item.code}</em>
        </button>)}
        {filtered.length>80&&<small>请继续输入名称或代码缩小范围</small>}
      </div>}
    </div>
  </label>;
}

const names: Record<string, string> = {
  "static-isp": "静态住宅 ISP",
  residential: "动态住宅代理",
  datacenter: "数据中心代理",
  "soft-router": "软路由中转",
  "computer-node": "电脑节点",
};

const categoryOf = (product: string): Exclude<Category, "all"> =>
  ["soft-router", "computer-node"].includes(product) ? "node" : "proxy";
const regionNames: Record<string,string> = Object.fromEntries(countries.map(item => [item.code, item.name]));

export default function ProductOffersModule() {
  const [items, setItems] = useState<Offer[]>([]);
  const [productTypes,setProductTypes]=useState<ProductType[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [managingTypes,setManagingTypes]=useState(false);
  const [editingType,setEditingType]=useState<ProductType|null>(null);
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
    if(Array.isArray(data.productTypes))setProductTypes(data.productTypes);
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(
    () => items.filter(item => category === "all" || (productTypes.find(type=>type.id===item.product)?.category||categoryOf(item.product)) === category),
    [items, category,productTypes],
  );
  const typeCategory=(product:string)=>productTypes.find(type=>type.id===product)?.category||categoryOf(product);
  const typeName=(product:string)=>productTypes.find(type=>type.id===product)?.name||names[product]||product;

  function showSuccess(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (typeCategory(String(body.product))==="node") {
      body.region = "GLOBAL";
      body.regionName = "全局节点";
    } else {
      body.regionName = regionNames[String(body.region)] || countryName(String(body.region));
    }
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
    showSuccess(`${typeName(item.product)} 已${item.enabled ? "下架" : "上架"}`);
  }
  async function saveType(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,body={...Object.fromEntries(new FormData(form)),id:editingType?.id||String(new FormData(form).get("id")),enabled:new FormData(form).get("enabled")==="on"},response=await fetch("/api/admin/product-types",{method:editingType?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),data=await response.json();
    if(!response.ok)return setError(data.error||"商品类型保存失败");setEditingType(null);form.reset();await load();showSuccess(editingType?"商品类型已更新":"商品类型已添加");
  }
  async function removeType(item:ProductType){if(!confirm(`确认删除商品类型“${item.name}”？`))return;const response=await fetch(`/api/admin/product-types?id=${encodeURIComponent(item.id)}`,{method:"DELETE"}),data=await response.json();if(!response.ok)return setError(data.error||"删除失败");await load();showSuccess("商品类型已删除")}
  async function toggleType(item:ProductType){const response=await fetch("/api/admin/product-types",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...item,enabled:!item.enabled})}),data=await response.json();if(!response.ok)return setError(data.error||"操作失败");await load();showSuccess(`商品类型已${item.enabled?"停用":"启用"}`)}

  return (
    <div className="business-page product-offers-page">
      {error && <div className="live-error">{error}<button onClick={() => setError("")}>×</button></div>}
      {success && <div className="offer-success"><span>✓</span>{success}</div>}

      <div className="business-kpis">
        <article><span>商品配置</span><b>{items.length}</b><small>地区独立定价</small></article>
        <article><span>剩余可售额度</span><b>{items.reduce((n, x) => n + Math.max(0, x.saleStock - x.sold), 0)}</b><small>不读取库存中心</small></article>
        <article><span>节点服务</span><b>{items.filter(x => typeCategory(x.product) === "node").length}</b><small>节点销售配置</small></article>
        <article><span>在售配置</span><b>{items.filter(x => x.enabled).length}</b><small>前台可购买</small></article>
      </div>

      <div className="business-card">
        <header>
          <div>
            <h2>商品管理</h2>
            <p>通过“编辑商品”统一修改类型、地区、周期价格、销售额度和排序。</p>
          </div>
          <div className="product-header-actions"><button onClick={()=>setManagingTypes(true)}>管理商品类型</button><button className="primary" onClick={() => setCreating(true)}>＋ 添加商品</button></div>
        </header>

        <div className="offer-category-tabs" aria-label="商品分类">
          <button className={category === "all" ? "on" : ""} onClick={() => setCategory("all")}>全部商品 <b>{items.length}</b></button>
          <button className={category === "proxy" ? "on" : ""} onClick={() => setCategory("proxy")}>代理 IP <b>{items.filter(x => typeCategory(x.product) === "proxy").length}</b></button>
          <button className={category === "node" ? "on" : ""} onClick={() => setCategory("node")}>节点服务 <b>{items.filter(x => typeCategory(x.product) === "node").length}</b></button>
        </div>

        <div className="business-table product offer-table offer-readonly-table">
          <div className="brow head">
            <span>分类 / 商品</span><span>地区</span><span>7 天价</span><span>30 天价</span>
            <span>90 天价</span><span>额度 / 剩余</span><span>操作</span>
          </div>
          {visibleItems.map(item => (
            <div className="brow" key={item.id}>
              <span className="offer-identity">
                <em>{typeCategory(item.product) === "node" ? "节点服务" : "代理 IP"}</em>
                <b>{typeName(item.product)}</b>
              </span>
              <span><b>{item.regionName}</b><small>{item.region}</small></span>
              <span className="offer-price">${item.price7.toFixed(2)}</span>
              <span className="offer-price">${item.price30.toFixed(2)}</span>
              <span className="offer-price">${item.price90.toFixed(2)}</span>
              <span><b>{item.saleStock}</b><small>剩余 {Math.max(0, item.saleStock - item.sold)}</small></span>
              <span className="offer-row-actions">
                <button className="offer-edit" onClick={() => setEditing(item)}>编辑商品</button>
                <button type="button" role="switch" aria-checked={item.enabled} title={item.enabled ? "点击暂停销售" : "点击恢复销售"} className={`sale-toggle ${item.enabled ? "on" : "off"}`} onClick={() => void toggle(item)}>
                  <span/><b>{item.enabled ? "正在售卖" : "暂停销售"}</b><i/>
                </button>
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
              <label>商品类型<select name="product" defaultValue={editing?.product || productTypes.find(x=>x.enabled)?.id}>{productTypes.filter(x=>x.enabled||x.id===editing?.product).map(type=><option key={type.id} value={type.id}>{type.name}（{type.category==="node"?"节点服务":"代理 IP"}）</option>)}</select></label>
              <CountryPicker defaultValue={editing?.region || "US"}/>
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
      {managingTypes&&<div className="modal product-type-modal"><section>
        <header><div><h2>商品类型管理</h2><p>新增类型会同步到商品编辑和前台商品导航。</p></div><button onClick={()=>{setManagingTypes(false);setEditingType(null)}}>×</button></header>
        <div className="product-type-list">{productTypes.map(type=><article key={type.id}><div><b>{type.name}</b><small>{type.id} · {type.category==="node"?"节点服务":"代理 IP"}</small></div><em className={type.enabled?"on":""}>{type.enabled?"已启用":"已停用"}</em><button onClick={()=>setEditingType(type)}>编辑</button><button onClick={()=>void toggleType(type)}>{type.enabled?"停用":"启用"}</button><button className="danger-outline" onClick={()=>void removeType(type)}>删除</button></article>)}</div>
        <form onSubmit={saveType}><h3>{editingType?"编辑商品类型":"新增商品类型"}</h3><div className="form-grid"><label>类型标识<input name="id" required disabled={!!editingType} defaultValue={editingType?.id} placeholder="例如 mobile-proxy"/></label><label>显示名称<input name="name" required defaultValue={editingType?.name}/></label><label>所属分类<select name="category" defaultValue={editingType?.category||"proxy"}><option value="proxy">代理 IP</option><option value="node">节点服务</option></select></label><label>排序<input name="sortOrder" type="number" defaultValue={editingType?.sortOrder??100}/></label><label className="wide">商品说明<input name="description" maxLength={160} defaultValue={editingType?.description}/></label></div><label className="type-enabled"><input name="enabled" type="checkbox" defaultChecked={editingType?.enabled??true}/> 启用该商品类型</label><footer><button type="button" onClick={()=>setEditingType(null)}>清空</button><button className="primary">保存商品类型</button></footer></form>
      </section></div>}
    </div>
  );
}
