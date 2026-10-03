export type LedgerContext={bundled:boolean;items:{orderId:string;product:string;amount:number;currency:string;resources:{id:string;name:string;ip:string;note:string}[]}[]};
export function LedgerSummary({context}:{context?:LedgerContext|null}){
 if(!context?.items.length)return <>—</>;
 const resources=context.items.flatMap(item=>item.resources);
 return <span className="ledger-service-summary">{context.bundled&&<b>合并支付 · {context.items.length} 项服务</b>}{resources.slice(0,2).map((r,i)=><span key={r.id+i}><b>{r.name}</b><small>{r.ip}</small>{r.note&&<small className="ledger-note">{r.note}</small>}</span>)}{resources.length>2&&<small>另有 {resources.length-2} 个资源 · 点击流水号查看全部</small>}{!resources.length&&<small>暂无关联资源</small>}</span>
}
export function LedgerDetails({context,paid}:{context?:LedgerContext|null;paid:number}){
 if(!context?.items.length)return null;
 const total=context.items.reduce((sum,item)=>sum+item.amount,0);
 return <section className="ledger-service-details"><h3>{context.bundled?"合并支付明细":"关联服务"}</h3><p>名称和客户备注显示当前服务信息</p><div className="ledger-service-scroll">{context.items.map(item=><article key={item.orderId}><header><b>{item.orderId}</b><span>{item.currency} {item.amount.toFixed(2)}</span></header>{item.resources.map((r,i)=><div className="ledger-resource" key={r.id+i}><strong>{r.name}</strong><span>{r.ip||"节点服务"}</span><small>备注：{r.note||"未填写"}</small></div>)}{!item.resources.length&&<p>暂无关联资源</p>}</article>)}</div>{context.bundled&&<footer><span>子订单金额合计 {total.toFixed(2)}</span><strong>本笔流水金额 {Math.abs(paid).toFixed(2)}</strong>{Math.abs(total-Math.abs(paid))>0.005&&<small>子订单标价与本笔金额有差异，以流水实际金额为准，未对差额进行平均分摊。</small>}</footer>}</section>
}
