"use client";
import {useState} from "react";
import {BillingManagement,TransactionLedger} from "./FinancialOperations";
import "./financial-details.css";
export default function FinancialDetails(){
 const [view,setView]=useState<"bills"|"ledger">(()=>typeof window!=="undefined"&&new URL(location.href).searchParams.get("view")==="ledger"?"ledger":"bills");
 function choose(next:"bills"|"ledger"){setView(next);const url=new URL(location.href);url.searchParams.set("view",next);history.replaceState(history.state,"",url)}
 return <div className="financial-details-page"><div className="finance-view-switch" role="tablist" aria-label="财务明细类型"><button role="tab" aria-selected={view==="bills"} onClick={()=>choose("bills")}><b>收款账单</b><small>应收项目、付款与退款状态</small></button><button role="tab" aria-selected={view==="ledger"} onClick={()=>choose("ledger")}><b>资金流水</b><small>实际收支、余额变动与调账</small></button></div><p className="finance-view-help">同一笔业务可同时产生账单和流水，它们是应收凭证与资金变化的两个视角，不代表重复收款。点击记录查看详情。</p><div role="tabpanel" key={view}>{view==="bills"?<BillingManagement/>:<TransactionLedger/>}</div></div>
}
