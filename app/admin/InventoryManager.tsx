"use client";

import {useEffect,useMemo,useState} from "react";

type Item={
  id:string;host:string;port:number;product:string;country:string;city:string|null;
  username:string|null;protocol:string;cost:number|null;
  status:string;reservedByOrderId:string|null;customerEmail:string|null;
};
type Order={
  id:string;customerEmail:string;product:string;region:string;quantity:number;
  durationDays:number;status:string;
};

const statusNames:Record<string,string>={
  available:"可售",reserved:"已预留",allocated:"已分配",disabled:"已停用"
};

export default function InventoryManager({onImport}:{onImport:()=>void}){
  const[rows,setRows]=useState<Item[]>([]);
  const[orders,setOrders]=useState<Order[]>([]);
  const[edit,setEdit]=useState<Item|null>(null);
  const[distribute,setDistribute]=useState<Item|null>(null);
  const[selectedOrder,setSelectedOrder]=useState("");
  const[error,setError]=useState("");
  const[saving,setSaving]=useState(false);

  async function load(){
    const[r,o]=await Promise.all([
      fetch("/api/admin/inventory-list?size=100"),
      fetch("/api/admin/orders?size=500")
    ]);
    const[rd,od]=await Promise.all([r.json(),o.json()]);
    if(!r.ok)return setError(rd.error||"库存加载失败");
    setRows(rd.items);
    if(o.ok)setOrders(od.items||[]);
  }
  useEffect(()=>{void load()},[]);

  const eligibleOrders=useMemo(()=>{
    if(!distribute)return[];
    return orders.filter(order=>
      ["paid","provisioning"].includes(order.status)&&
      order.product===distribute.product&&
      (!order.region||order.region===distribute.country)
    );
  },[orders,distribute]);

  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!edit)return;
    setSaving(true);setError("");
    const body=Object.fromEntries(new FormData(e.currentTarget));
    const r=await fetch(`/api/admin/inventory-item/${edit.id}`,{
      method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)
    }),d=await r.json();
    setSaving(false);
    if(!r.ok)return setError(d.error||"保存失败");
    setEdit(null);await load();
  }

  async function allocate(){
    if(!distribute||!selectedOrder)return;
    setSaving(true);setError("");
    const r=await fetch(`/api/admin/inventory-item/${distribute.id}/allocate`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({orderId:selectedOrder})
    }),d=await r.json();
    setSaving(false);
    if(!r.ok)return setError(d.error||"分发失败");
    setDistribute(null);setSelectedOrder("");await load();
  }

  return <div className="module inventory-manager">
    <div className="module-toolbar">
      <button className="on">库存列表 {rows.length}</button>
      <button className="primary" onClick={onImport}>＋ 批量入库</button>
    </div>
    {error&&<div className="live-error">{error}<button onClick={()=>setError("")}>×</button></div>}
    <div className="admin-table">
      <div className="arow inventory-row ahead"><span>库存资源</span><span>地区</span><span>代理认证账号</span><span>分发信息</span><span>采购成本</span><span>状态</span><span>操作</span></div>
      {rows.map(x=><div className="arow inventory-row" key={x.id}>
        <span className="inventory-resource"><b className="mono">{x.host}:{x.port}</b><small>{x.product}</small></span>
        <span>{x.country}{x.city?` / ${x.city}`:""}</span>
        <span>{x.username||"无认证"}</span>
        <span className="inventory-customer">{x.customerEmail?<><b>{x.customerEmail}</b><small>{x.reservedByOrderId}</small></>:"未分发"}</span>
        <span>{x.cost==null?"未填写":`¥${x.cost.toFixed(2)}`}</span>
        <span><em className={`inventory-state ${x.status}`}>{statusNames[x.status]||x.status}</em></span>
        <span className="inventory-actions">{x.status==="available"&&<button className="primary" onClick={()=>{setDistribute(x);setSelectedOrder("")}}>分发</button>}<button onClick={()=>setEdit(x)}>编辑</button></span>
      </div>)}
    </div>

    {edit&&<div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}>
      <form onSubmit={save}>
        <div><h2>编辑库存资源</h2><button type="button" onClick={()=>setEdit(null)}>×</button></div>
        <div className="form-grid">
          <label>IP / 主机<input name="host" defaultValue={edit.host} required/></label>
          <label>端口<input name="port" type="number" min="1" max="65535" defaultValue={edit.port} required/></label>
          <label>代理认证账号<input name="username" defaultValue={edit.username||""} placeholder="无认证可留空"/></label>
          <label>新密码<input name="password" type="text" placeholder="留空表示不修改"/></label>
          <label>协议<select name="protocol" defaultValue={edit.protocol}><option>HTTPS</option><option>HTTP</option><option>SOCKS5</option></select></label>
          <label>城市<input name="city" defaultValue={edit.city||""}/></label>
          <label>采购成本（可选）<input name="cost" type="number" min="0" step="0.01" defaultValue={edit.cost??""} placeholder="不填写则不记录"/></label>
          <label>库存状态<select name="status" defaultValue={edit.status} disabled={edit.status==="allocated"||edit.status==="reserved"}>
            <option value="available">可售</option><option value="disabled">已停用</option>
            {(edit.status==="reserved"||edit.status==="allocated")&&<option value={edit.status}>{statusNames[edit.status]}</option>}
          </select>{(edit.status==="allocated"||edit.status==="reserved")&&<input type="hidden" name="status" value={edit.status}/>}</label>
          <label>分发客户<input value={edit.customerEmail||"未分发"} disabled/></label>
        </div>
        <p className="inventory-form-tip">分发客户和已分配状态由订单分发流程维护，不能在资源编辑中手动填写。</p>
        <footer><button type="button" onClick={()=>setEdit(null)}>取消</button><button className="primary" disabled={saving}>{saving?"保存中…":"保存更改"}</button></footer>
      </form>
    </div>}

    {distribute&&<div className="modal inventory-allocation-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setDistribute(null)}}>
      <section className="inventory-allocation-modal">
        <header><div><small>库存资源 {distribute.host}:{distribute.port}</small><h2>选择客户订单进行分发</h2></div><button onClick={()=>setDistribute(null)}>×</button></header>
        <div className="inventory-allocation-body">
          <p>只显示商品类型和地区匹配、且正在等待开通的客户订单。</p>
          <label>分发账号 / 客户订单
            <select value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)}>
              <option value="">请选择已有客户订单</option>
              {eligibleOrders.map(order=><option value={order.id} key={order.id}>{order.customerEmail} · {order.id} · {order.quantity} 条 / {order.durationDays} 天</option>)}
            </select>
          </label>
          {!eligibleOrders.length&&<div className="inventory-no-order">当前没有与该库存匹配的待开通客户订单，请先在订单管理中创建或确认订单。</div>}
        </div>
        <footer><button onClick={()=>setDistribute(null)}>取消</button><button className="primary" disabled={!selectedOrder||saving} onClick={allocate}>{saving?"正在分发…":"确认分发"}</button></footer>
      </section>
    </div>}
  </div>;
}
