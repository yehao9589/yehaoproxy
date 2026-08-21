"use client";

import {useEffect, useMemo, useState} from "react";
import { countries, countryFlag, countryName } from "../../lib/countries";
import ServicePriceSettings from "./settings/ServicePriceSettings";

type Offer = {
  id: string;
  product: string;
  region: string;
  regionName: string;
  billingCycle: "fixed-days"|"calendar-month";
  price7: number;
  price30: number;
  price90: number;
  price180: number;
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
  const searchText=query.trim();
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
  const [showDefaultPolicy,setShowDefaultPolicy]=useState(false);
  const [editingType,setEditingType]=useState<ProductType|null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [formProduct,setFormProduct]=useState("");
  const [formBillingCycle,setFormBillingCycle]=useState<"fixed-days"|"calendar-month">("fixed-days");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [servicePolicy,setServicePolicy]=useState({resetPrice:"5",replacePrice:"5",freeDays:"3",freeCount:"1",credentialEditing:false});
  const [policyOptions,setPolicyOptions]=useState<Record<string,string>>({});
  const [offerPolicy,setOfferPolicy]=useState({resetPrice:"",replacePrice:"",freeDays:"",freeCount:""});

  async function load() {
    const [response,settingsResponse] = await Promise.all([fetch("/api/admin/products"),fetch("/api/admin/settings")]);
    const data = await response.json();
    const settingsData = await settingsResponse.json().catch(()=>({}));
    if (!response.ok) return setError(data.error || "商品加载失败");
    setItems(data.items);
    if(Array.isArray(data.productTypes))setProductTypes(data.productTypes);
    if(settingsResponse.ok){const options=settingsData.options||{};setPolicyOptions(options);setServicePolicy({resetPrice:String(options.nodeTrafficResetPrice??5),replacePrice:String(options.ipReplacementPrice??5),freeDays:String(options.ipReplacementFreeDays??3),freeCount:String(options.ipReplacementFreeCount??1),credentialEditing:options.customer_node_credential_editing==="true"})}
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

  function openOfferEditor(item:Offer){
    const key=(name:string)=>policyOptions[`productPolicy:${item.id}:${name}`]||"";
    setOfferPolicy({resetPrice:key("nodeTrafficResetPrice"),replacePrice:key("ipReplacementPrice"),freeDays:key("ipReplacementFreeDays"),freeCount:key("ipReplacementFreeCount")});
    setFormProduct(item.product);setFormBillingCycle(item.billingCycle||"fixed-days");setEditing(item);
  }

  function openOfferCreator(){setOfferPolicy({resetPrice:"",replacePrice:"",freeDays:"",freeCount:""});setFormProduct(productTypes.find(x=>x.enabled)?.id||"");setFormBillingCycle("fixed-days");setCreating(true)}

  async function saveServicePolicy(product:string,offerId:string){
    const values=typeCategory(product)==="node"
      ? [["nodeTrafficResetPrice",offerPolicy.resetPrice]]
      : [["ipReplacementPrice",offerPolicy.replacePrice],["ipReplacementFreeDays",offerPolicy.freeDays],["ipReplacementFreeCount",offerPolicy.freeCount]];
    for(const[key,value]of values){
      const response=await fetch("/api/admin/product-policy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId,name:key,value})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"商品服务功能保存失败");
    }
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
    if (!response.ok) {setSaving(false);return setError(data.error || "保存失败");}
    try{await saveServicePolicy(String(body.product),editing?.id||String(data.id))}catch(error){setSaving(false);return setError(error instanceof Error?error.message:"商品服务功能保存失败")}
    setSaving(false);
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
      {error && <div className="offer-toast error" role="alert"><span>!</span><b>{error}</b><button aria-label="关闭提示" onClick={() => setError("")}>×</button></div>}
      {success && <div className="offer-toast success" role="status"><span>✓</span><b>{success}</b></div>}

      <div className="business-kpis">
        <article><span>商品配置</span><b>{items.length}</b><small>地区独立定价</small></article>
        <article><span>限量商品剩余额度</span><b>{items.filter(x => x.saleStock >= 0).reduce((n, x) => n + Math.max(0, x.saleStock - x.sold), 0)}</b><small>{items.filter(x => x.saleStock < 0).length} 项不限量</small></article>
        <article><span>节点服务</span><b>{items.filter(x => typeCategory(x.product) === "node").length}</b><small>节点销售配置</small></article>
        <article><span>在售配置</span><b>{items.filter(x => x.enabled).length}</b><small>前台可购买</small></article>
      </div>

      <div className="business-card">
        <header>
          <div>
            <h2>商品管理</h2>
            <p>通过“编辑商品”统一修改类型、地区、周期价格、销售额度和排序。</p>
          </div>
          <div className="product-header-actions"><button onClick={()=>setShowDefaultPolicy(true)}>默认服务配置</button><button onClick={()=>setManagingTypes(true)}>管理商品类型</button><button className="primary" onClick={openOfferCreator}>＋ 添加商品</button></div>
        </header>

        <div className="offer-category-tabs" aria-label="商品分类">
          <button className={category === "all" ? "on" : ""} onClick={() => setCategory("all")}>全部商品 <b>{items.length}</b></button>
          <button className={category === "proxy" ? "on" : ""} onClick={() => setCategory("proxy")}>代理 IP <b>{items.filter(x => typeCategory(x.product) === "proxy").length}</b></button>
          <button className={category === "node" ? "on" : ""} onClick={() => setCategory("node")}>节点服务 <b>{items.filter(x => typeCategory(x.product) === "node").length}</b></button>
        </div>

        <div className="business-table product offer-table offer-readonly-table">
          <div className="brow head">
            <span>分类 / 商品</span><span>地区</span><span>短周期</span><span>标准周期</span>
            <span>长期周期</span><span>额度 / 剩余</span><span>操作</span>
          </div>
          {visibleItems.map(item => (
            <div className="brow" key={item.id}>
              <span className="offer-identity">
                <em>{typeCategory(item.product) === "node" ? "节点服务" : "代理 IP"}</em>
                <b>{typeName(item.product)}</b><small>{item.billingCycle==="calendar-month"?"自然月计费":"固定天数计费"}</small>
              </span>
              <span><b>{item.regionName}</b><small>{item.region}</small></span>
              <span className="offer-price">{item.billingCycle==="calendar-month"?(item.price30 < 0 ? "不出售" : <><b>¥{item.price30.toFixed(2)}</b><small>1 个自然月</small></>):item.price7 < 0 ? "不出售" : <><b>¥{item.price7.toFixed(2)}</b><small>7 天</small></>}</span>
              <span className="offer-price">{item.billingCycle==="calendar-month"?(item.price90 < 0 ? "不出售" : <><b>¥{item.price90.toFixed(2)}</b><small>3 个自然月</small></>):item.price30 < 0 ? "不出售" : <><b>¥{item.price30.toFixed(2)}</b><small>30 天</small></>}</span>
              <span className="offer-price">{item.billingCycle==="calendar-month"?(item.price180 < 0 ? "不出售" : <><b>¥{item.price180.toFixed(2)}</b><small>6 个自然月</small></>):item.price90 < 0 ? "不出售" : <><b>¥{item.price90.toFixed(2)}</b><small>90 天</small></>}</span>
              <span><b>{item.saleStock < 0 ? "不限量" : item.saleStock}</b><small>{item.saleStock < 0 ? `已售 ${item.sold}` : `剩余 ${Math.max(0, item.saleStock - item.sold)}`}</small></span>
              <span className="offer-row-actions">
                <button className="offer-edit" onClick={() => openOfferEditor(item)}>编辑商品</button>
                <button type="button" role="switch" aria-checked={item.enabled} title={item.enabled ? "点击暂停销售" : "点击恢复销售"} className={`sale-toggle ${item.enabled ? "on" : "off"}`} onClick={() => void toggle(item)}>
                  <span/><b>{item.enabled ? "正在售卖" : "暂停销售"}</b><i/>
                </button>
              </span>
            </div>
          ))}
          {visibleItems.length === 0 && <div className="offer-empty">该分类暂无商品，请点击右上角添加。</div>}
        </div>
      </div>

      {showDefaultPolicy&&<div className="modal default-policy-modal" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDefaultPolicy(false)}}><div className="default-policy-dialog"><header><div><h2>默认服务配置</h2><p>商品未设置独立金额时使用这里的默认值。</p></div><button type="button" aria-label="关闭" onClick={()=>setShowDefaultPolicy(false)}>×</button></header><ServicePriceSettings/></div></div>}

      {(creating || editing) && (
        <div className="modal">
          <form onSubmit={submit}>
            <div><h2>{editing ? "编辑商品" : "添加商品"}</h2><button type="button" onClick={() => {setCreating(false); setEditing(null);}}>×</button></div>
            <div className="form-grid">
              <label>商品类型<select name="product" value={formProduct} onChange={event=>setFormProduct(event.target.value)}>{productTypes.filter(x=>x.enabled||x.id===editing?.product).map(type=><option key={type.id} value={type.id}>{type.name}（{type.category==="node"?"节点服务":"代理 IP"}）</option>)}</select></label>
              <label>周期计算方式<select name="billingCycle" value={formBillingCycle} onChange={event=>setFormBillingCycle(event.target.value as "fixed-days"|"calendar-month")}><option value="fixed-days">固定天数</option><option value="calendar-month">自然月</option></select></label>
              {typeCategory(formProduct)==="node"
                ? <label>销售地区<input value="全局节点（无需选择国家）" disabled/></label>
                : <CountryPicker defaultValue={editing?.region && editing.region!=="GLOBAL" ? editing.region : "US"}/>}
              {formBillingCycle==="fixed-days"&&<label>7 天单价<input name="price7" type="number" min="0.01" step="0.01" placeholder="不填写表示不出售" defaultValue={editing && editing.price7 >= 0 ? editing.price7 : ""}/></label>}
              <label>{formBillingCycle==="calendar-month"?"1 个自然月单价":"30 天单价"}<input name="price30" type="number" min="0.01" step="0.01" placeholder="不填写表示不出售" defaultValue={editing && editing.price30 >= 0 ? editing.price30 : ""}/></label>
              <label>{formBillingCycle==="calendar-month"?"3 个自然月单价":"90 天单价"}<input name="price90" type="number" min="0.01" step="0.01" placeholder="不填写表示不出售" defaultValue={editing && editing.price90 >= 0 ? editing.price90 : ""}/></label>
              {formBillingCycle==="calendar-month"&&<label>6 个自然月单价<input name="price180" type="number" min="0.01" step="0.01" placeholder="不填写表示不出售" defaultValue={editing && editing.price180 >= 0 ? editing.price180 : ""}/></label>}
              <label>前台销售额度<input name="saleStock" type="number" min="0" step="1" placeholder="不填写表示不限量" defaultValue={editing && editing.saleStock >= 0 ? editing.saleStock : ""}/></label>
              <label>显示排序<input name="sortOrder" type="number" step="1" defaultValue={editing?.sortOrder ?? 100}/></label>
            </div>
            <section className="offer-service-policy">
              <div className="offer-service-policy-title"><b>{typeCategory(formProduct)==="node"?"节点服务功能":"代理 IP 服务功能"}</b><small>保存商品时同步更新该类商品的客户功能规则</small></div>
              {typeCategory(formProduct)==="node"?<>
                <div className="form-grid">
                  <label>流量重置费用<input type="number" min="0" step="0.01" placeholder={`留空使用默认 ¥${servicePolicy.resetPrice}`} value={offerPolicy.resetPrice} onChange={event=>setOfferPolicy(value=>({...value,resetPrice:event.target.value}))}/><small>留空时使用上方默认金额</small></label>
                </div>
              </>:<>
                <div className="form-grid">
                  <label>付费更换 IP 价格<input type="number" min="0" step="0.01" placeholder={`留空使用默认 ¥${servicePolicy.replacePrice}`} value={offerPolicy.replacePrice} onChange={event=>setOfferPolicy(value=>({...value,replacePrice:event.target.value}))}/><small>免费期或次数用完后的单次费用</small></label>
                  <label>免费更换有效期<input type="number" min="0" max="365" step="1" placeholder={`留空使用默认 ${servicePolicy.freeDays} 天`} value={offerPolicy.freeDays} onChange={event=>setOfferPolicy(value=>({...value,freeDays:event.target.value}))}/><small>从 IP 开通时间开始计算</small></label>
                  <label>免费更换次数<input type="number" min="0" max="100" step="1" placeholder={`留空使用默认 ${servicePolicy.freeCount} 次`} value={offerPolicy.freeCount} onChange={event=>setOfferPolicy(value=>({...value,freeCount:event.target.value}))}/><small>每条已开通 IP 的免费次数</small></label>
                </div>
              </>}
            </section>
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
