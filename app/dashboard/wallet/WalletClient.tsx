"use client";
import {useEffect,useState} from "react";
import {LedgerSummary,LedgerDetails,type LedgerContext} from "./LedgerServices";
import Pagination from "../../Pagination";
import {usePageSize} from "../../usePageSize";
import ConsoleIcon from "../../components/ConsoleIcon";
import "./ledger-services.css";
type RelatedOrder={id:string;product:string;region:string;quantity:number;amount:number;currency:string;status:string;paymentMethod:string;paymentReference:string|null;createdAt:string};type Tx={id:string;type:string;amount:number;balanceBefore:number;balanceAfter:number;paymentMethod:string|null;paymentLabel:string;referenceType:string|null;referenceId:string|null;note:string|null;operatorId:string|null;createdAt:string;serviceContext?:LedgerContext|null;relatedOrder:RelatedOrder|null};type Gateway={id:string;name:string;type:string};type Wallet={balance:number;creditLimit:number;creditUsed:number;availableCredit:number;currency:string;currencySymbol:string;creditStatus:string;billDay:number;repaymentDay:number;graceDays:number};
const names:Record<string,string>={deposit:"充值入账",purchase:"订单消费",refund:"退款入账",adjustment:"人工调账",freeze:"资金冻结",unfreeze:"资金解冻",credit_repayment:"信用账单还款"};
const beijingTime=(value:string)=>new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});
const ledgerDate=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"});
const ledgerTime=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const ledgerNumber=new Intl.NumberFormat("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function WalletClient(){
 const[wallet,setWallet]=useState<Wallet>({balance:0,creditLimit:0,creditUsed:0,availableCredit:0,currency:"CNY",currencySymbol:"¥",creditStatus:"active",billDay:1,repaymentDay:10,graceDays:2}),[tx,setTx]=useState<Tx[]>([]),[detail,setDetail]=useState<Tx|null>(null),[gateways,setGateways]=useState<Gateway[]>([]),[open,setOpen]=useState(false),[amount,setAmount]=useState("100"),[gateway,setGateway]=useState(""),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const money=(v:number)=>`${wallet.currencySymbol}${ledgerNumber.format(Number(v||0))}`;
 const signedMoney=(v:number)=>v<0?`−${money(Math.abs(v))}`:`${v>0?"+":""}${money(v)}`;
 const [summaryReady,setSummaryReady]=useState(false);
 const[page,setPage]=useState(1),[pageSize,setPageSize]=usePageSize();
 const[dates,setDates]=useState({from:"",to:""}),[filters,setFilters]=useState({from:"",to:""});
 const[pagination,setPagination]=useState<{page:number;size:number;total:number}|null>(null);
 const[loading,setLoading]=useState(true),[ledgerError,setLedgerError]=useState(""),[summaryError,setSummaryError]=useState(""),[refresh,setRefresh]=useState(0);
 const ledgerPage=pagination?.page??1,ledgerSize=pagination?.size??pageSize;
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/wallet?view=summary",{cache:"no-store",signal:controller.signal}).then(async response=>{
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"账户余额读取失败");
   if(!controller.signal.aborted){setWallet(data.wallet);setSummaryReady(true);}
  }).catch(()=>{if(!controller.signal.aborted)setSummaryError("暂时无法读取账户余额，请刷新页面重试。")});
  void fetch("/api/wallet/recharge",{signal:controller.signal}).then(async response=>{
   const data=await response.json();
   if(response.ok&&!controller.signal.aborted){setGateways(data.gateways||[]);setGateway(value=>value||data.gateways?.[0]?.type||"");}
  }).catch(()=>{});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams({view:"ledger",page:String(page),size:String(pageSize),from:filters.from,to:filters.to});
  setLoading(true);setLedgerError("");
  void fetch("/api/wallet?"+params,{cache:"no-store",signal:controller.signal}).then(async response=>{
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"资金流水读取失败");
   if(!controller.signal.aborted){setTx(data.transactions);setPagination(data.pagination);}
  }).catch(error=>{if(!controller.signal.aborted){setLedgerError(error.message||"资金流水读取失败");setTx([]);setPagination(null);}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[page,pageSize,filters,refresh]);

 async function recharge(e:React.FormEvent){e.preventDefault();setSaving(true);const r=await fetch("/api/wallet/recharge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount:Number(amount),gateway})}),d=await r.json();setSaving(false);if(!r.ok)return setMessage(d.error||"充值订单创建失败");if(d.redirectUrl)return location.href=d.redirectUrl;setMessage(`充值订单 ${d.orderId} 已创建`);setOpen(false)}
 const status=({active:"正常",overdue:"已逾期",frozen:"已冻结"} as Record<string,string>)[wallet.creditStatus]||"正常";
 const hasCredit=wallet.creditLimit>0||wallet.creditUsed>0||wallet.availableCredit>0||wallet.creditStatus!=="active";
 return <div className="customer-page wallet-page wallet-workspace">
  <div className="wallet-workspace-content">
  <section className="wallet-account" aria-labelledby="wallet-title">
   <div className="wallet-account-overview">
    <div className="wallet-account-heading">
     <span className="wallet-account-icon"><ConsoleIcon name="wallet"/></span>
     <div><h1 id="wallet-title">余额与流水</h1><p>账户余额</p><strong>{summaryReady?money(wallet.balance):"—"}</strong>{summaryReady&&<small>{wallet.currency}</small>}</div>
    </div>
    <button data-ui="action" data-ui-tone="primary" type="button" onClick={()=>setOpen(true)}><ConsoleIcon name="plus"/>余额充值</button>
   </div>
   {hasCredit&&<div className="wallet-credit-strip">
    <dl><div><dt>信用额度</dt><dd>{money(wallet.creditLimit)}</dd></div><div><dt>本期待还</dt><dd>{money(wallet.creditUsed)}</dd></div><div><dt>可用信用</dt><dd>{money(wallet.availableCredit)}</dd></div></dl>
    <div className="wallet-credit-billing"><span className={wallet.creditStatus==="active"?"":"is-attention"}>{status}</span><small>每月 {wallet.billDay} 日出账 · {wallet.repaymentDay} 日还款</small></div>
    <a data-ui="action" data-ui-tone="text" href="/dashboard?tab=credit-bills">信用账单<ConsoleIcon name="arrow"/></a>
   </div>}
  </section>
  {message&&<div className="auth-success">{message}</div>}{summaryError&&<div className="live-error" role="alert">{summaryError}</div>}
 <section className="wallet-ledger-panel" aria-label="资金流水">
  <div className="wallet-ledger-toolbar">
   <div className="wallet-ledger-heading"><h2><ConsoleIcon name="receipt"/>资金流水</h2><p>时间按北京时间显示</p></div>
   <form className="wallet-ledger-filters" onSubmit={event=>{event.preventDefault();setPage(1);setDetail(null);setFilters({...dates});}}>
    <label><span>开始日期</span><input type="date" value={dates.from} max={dates.to||undefined} onChange={event=>setDates(current=>({...current,from:event.target.value}))}/></label>
    <label><span>结束日期</span><input type="date" value={dates.to} min={dates.from||undefined} onChange={event=>setDates(current=>({...current,to:event.target.value}))}/></label>
    <div className="wallet-ledger-filter-actions"><button data-ui="action" data-ui-tone="secondary" type="submit">查询</button><button data-ui="action" data-ui-tone="text" type="button" onClick={()=>{setDates({from:"",to:""});setFilters({from:"",to:""});setPage(1);setDetail(null);}}>清除</button></div>
   </form>
  </div>
  {ledgerError&&<div className="wallet-ledger-error live-error" role="alert">{ledgerError} <button data-ui="action" data-ui-tone="secondary" type="button" onClick={()=>setRefresh(value=>value+1)}>重试</button></div>}
  <div className="wallet-ledger-records" role="table" aria-label="资金流水记录" aria-busy={loading}>
   <div className="wallet-ledger-row wallet-ledger-column-head" role="row">
    <span role="columnheader">交易 / 流水号</span><span role="columnheader">关联服务 / 说明</span>
    <span role="columnheader">交易金额</span><span role="columnheader">变动后余额</span><span role="columnheader">交易时间</span>
   </div>
   {tx.length?tx.map((x,index)=>{
    const tone=x.amount>0?"in":x.amount<0?"out":"neutral";
    const icon=x.type==="purchase"&&x.paymentMethod==="credit"?"credit-card":tone==="in"?"arrow-in":tone==="out"?"arrow-out":"receipt";
    const date=new Date(x.createdAt);
    return <div className="wallet-ledger-row" role="row" key={x.id}>
     <div className="wallet-entry-identity" role="cell">
      <span className={`wallet-entry-icon is-${tone}`}><ConsoleIcon name={icon}/></span>
      <div>
       <strong>{names[x.type]||"其他交易"}</strong>
       <div className="wallet-entry-reference">
        <small title="序号">{(ledgerPage-1)*ledgerSize+index+1}.</small>
        <button className="wallet-entry-link" type="button" title="查看交易流水详情" onClick={()=>setDetail(x)}>{x.id}</button>
       </div>
      </div>
     </div>
     <div className="wallet-entry-context" role="cell">
      {x.serviceContext?.items.length?<LedgerSummary context={x.serviceContext}/>:null}
      {x.note?<p className="wallet-entry-note" title={x.note}>{x.note}</p>:!x.serviceContext?.items.length&&<span className="wallet-entry-context-empty">—</span>}
     </div>
     <div className="wallet-entry-amount" role="cell">
      <strong className={`wallet-entry-value is-${tone}`}>{signedMoney(x.amount)}</strong>
      {x.paymentLabel&&x.paymentLabel!=="—"&&<small>{x.paymentLabel}</small>}
     </div>
     <div className="wallet-entry-balance" role="cell"><small className="wallet-entry-mobile-label" aria-hidden="true">变动后余额</small>{money(x.balanceAfter)}</div>
     <div className="wallet-entry-date" role="cell">{Number.isFinite(date.getTime())?<time dateTime={x.createdAt}><span>{ledgerDate.format(date)}</span><small>{ledgerTime.format(date)}</small></time>:"—"}</div>
    </div>;
   }):<div role="row"><div className="wallet-ledger-empty" role="cell" aria-colspan={5}>{loading?"正在加载流水…":ledgerError?"暂时无法读取流水":filters.from||filters.to?"所选日期内没有资金流水":"暂无资金流水"}</div></div>}
  </div>
  {pagination&&<Pagination busy={loading} total={pagination.total} page={ledgerPage} pageSize={ledgerSize} onPage={value=>{setPage(value);setDetail(null);}} onPageSize={value=>{setPageSize(value);setPage(1);setDetail(null);}}/>}
 </section>
  </div>
 {detail&&<div className="customer-payment-mask" onMouseDown={event=>{if(event.target===event.currentTarget)setDetail(null)}}><section className="customer-payment-modal wallet-transaction-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-detail-title" onKeyDown={event=>{if(event.key==="Escape")setDetail(null)}}><header><h2 className="wallet-detail-title" id="wallet-detail-title"><ConsoleIcon name="receipt"/>交易流水详情</h2><button type="button" aria-label="关闭交易流水详情" autoFocus onClick={()=>setDetail(null)}>×</button></header><dl><div><dt>完整流水号</dt><dd className="mono">{detail.id}</dd></div><div><dt>交易类型</dt><dd>{names[detail.type]||"其他交易"}</dd></div><div><dt>支付方式</dt><dd>{detail.paymentLabel||"—"}</dd></div><div><dt>交易金额</dt><dd className={detail.amount>0?"wallet-entry-value is-in":"wallet-entry-value"}>{signedMoney(detail.amount)}</dd></div><div><dt>变动前余额</dt><dd>{money(detail.balanceBefore)}</dd></div><div><dt>变动后余额</dt><dd>{money(detail.balanceAfter)}</dd></div><div><dt>关联业务</dt><dd>{detail.referenceType||"—"}</dd></div><div><dt>关联订单</dt><dd>{detail.relatedOrder?.id||detail.referenceId||"—"}</dd></div>{detail.relatedOrder&&<><div><dt>商品 / 地区</dt><dd>{detail.relatedOrder.product} · {detail.relatedOrder.region} × {detail.relatedOrder.quantity}</dd></div><div><dt>订单状态</dt><dd>{detail.relatedOrder.status}</dd></div></>}<div><dt>交易说明</dt><dd>{detail.note||"—"}</dd></div><div><dt>交易时间</dt><dd>{beijingTime(detail.createdAt)}</dd></div></dl><LedgerDetails context={detail.serviceContext} paid={detail.amount}/><footer><button data-ui="action" data-ui-tone="primary" className="primary" type="button" onClick={()=>setDetail(null)}>关闭详情</button></footer></section></div>}
 {open&&<div className="customer-payment-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><form className="customer-payment-modal" onSubmit={recharge}><header><div><small>账户充值</small><h2>充值余额</h2></div><button type="button" onClick={()=>setOpen(false)}>×</button></header><label>充值金额<div className="recharge-amount"><span>{wallet.currency}</span><input type="number" min="10" max="100000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></div></label><div className="recharge-presets">{[50,100,200,500,1000].map(x=><button type="button" className={amount===String(x)?"on":""} onClick={()=>setAmount(String(x))} key={x}>{money(x)}</button>)}</div>{gateways.length?<label>支付方式<select value={gateway} onChange={e=>setGateway(e.target.value)}>{gateways.map(x=><option value={x.type} key={x.id}>{x.name}</option>)}</select></label>:<div className="live-error">暂未开通在线支付渠道</div>}<p>支付成功后，充值金额将自动计入账户余额。</p><footer><button data-ui="action" data-ui-tone="text" type="button" onClick={()=>setOpen(false)}>取消</button><button data-ui="action" data-ui-tone="primary" className="primary" disabled={saving||!gateways.length}>{saving?"正在创建订单…":"立即充值"}</button></footer></form></div>}</div>
}
