"use client";
import{useEffect,useState}from"react";
type C={code:string;name:string;symbol:string;rate:number;enabled:boolean;isDefault:boolean;decimalPlaces:number;sortOrder:number};

export default function CurrencySettings(){
  const[items,setItems]=useState<C[]>([]),[msg,setMsg]=useState(""),[loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    try{const r=await fetch("/api/admin/currencies",{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error||"币种读取失败");setItems(Array.isArray(d.items)?d.items:[]);if(!d.items?.length)setMsg("尚未初始化币种数据")}catch(error){setMsg(error instanceof Error?error.message:"币种读取失败")}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);
  async function choose(x:C){const r=await fetch("/api/admin/currencies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...x,enabled:true,isDefault:true,exclusive:true})}),d=await r.json();setMsg(r.ok?`系统币种已切换为 ${x.code}`:d.error||"币种切换失败");if(r.ok)await load()}
  return <section className="setting-card embedded-currency"><div className="setting-title"><div><h2>系统币种</h2><p>整个系统只能启用一个币种，切换后所有页面的货币符号和币种单位同步变更。</p></div><span>{items.find(x=>x.enabled)?.code||"未设置"}</span></div>{msg&&<div className="setting-note">{msg}</div>}{loading?<div className="setting-empty">正在加载币种配置…</div>:<div className="single-currency-grid">{items.map(x=><button type="button" key={x.code} className={x.enabled?"selected":""} onClick={()=>void choose(x)}><i>{x.symbol}</i><span><b>{x.code}</b><small>{x.name}</small></span><em>{x.enabled?"当前使用":"切换"}</em></button>)}</div>}<div className="setting-note">切换会统一改变全站记账单位和显示符号。正式运营后切换币种前，请先完成历史账务核对。</div></section>
}
