"use client";
import { useEffect, useState } from "react";

type Log = { id:string; logNo:number; actorId:string; actorName?:string|null; actorEmail?:string|null; resourceCustomerName?:string|null; resourceDisplay?:string|null; actorRole:string; action:string; resourceType:string; resourceId:string|null; detail:string|null; ipAddress:string|null; createdAt:string };
type Category = "all" | "login" | "system" | "email" | "scheduled";
const categories: Category[] = ["all", "login", "system", "email", "scheduled"];
const meta: Record<Category,{label:string;icon:string;desc:string}> = {
  all:{label:"全部日志",icon:"全",desc:"汇总所有系统事件"},
  login:{label:"登录日志",icon:"登",desc:"登录、退出与失败记录"},
  system:{label:"系统日志",icon:"系",desc:"管理操作与业务变更"},
  email:{label:"邮件日志",icon:"邮",desc:"邮件投递成功与失败"},
  scheduled:{label:"定时任务日志",icon:"时",desc:"计划任务执行结果"},
};
const names: Record<string,string> = {
  "auth.login.success":"登录成功","auth.login.failed":"登录失败","auth.logout":"退出登录",
  "email.sent":"邮件发送成功","email.failed":"邮件发送失败","scheduled.reminders.run":"服务提醒任务执行",
  "admin.create":"创建管理员","customer.update":"修改客户资料","customer.credit.update":"调整客户信用额度",
  "customer.impersonate":"管理员登录客户面板","wallet.adjust":"客户余额调账","order.confirm":"确认订单收款",
  "order.cancel":"取消订单","order.fulfill":"提取并发放代理","order.refund":"订单退款","order.update":"修改订单信息",
  "order.service_update":"修改订单服务配置","proxy.update":"修改代理资料","inventory.import":"导入代理库存",
  "proxy.resource.update":"修改代理资源信息",
  "inventory.update":"修改库存资源","ticket.reply":"回复客户工单",
  "database.test_data.reset":"重置系统测试数据",
  "node.traffic_reset.order_create":"创建流量重置订单",
  "order.auto_extract":"自动提取并交付代理资源",
  "order.wallet_credit_pay":"使用余额或信用额度支付订单",
  "proxy.bulk_renew_complete":"批量续费完成",
  "proxy.renewal_orders.create":"创建代理续费订单",
  "renewal.verify.approve":"续费订单核验通过",
  "renewal.verify.reject":"续费订单核验拒绝并退款",
  "service.reject":"拒绝售后申请并退款",
  "service.replace.free_create":"提交免费更换 IP 申请",
  "service.replace.order_create":"创建付费更换 IP 订单",
  "service.replace.complete":"执行并完成 IP 更换",
  "service.traffic_reset.complete":"执行并完成流量重置",
  "service.traffic_reset.failed":"流量重置执行失败",
  "service.traffic_reset.failed":"流量重置执行失败",
  "service.renew.create":"提交服务续费申请",
  "service.renew.complete":"执行并完成服务续费",
  "service.renew.verify":"核验服务续费结果",
  "service.custom.complete":"执行并完成一次性服务",
};
const resources: Record<string,string> = {auth:"账户认证",admin:"管理员",customer:"客户",wallet:"钱包",order:"订单",proxy:"代理资源",inventory:"库存资源",service_request:"售后申请",ticket:"工单",notification:"通知",email:"邮件",scheduled_task:"定时任务",database:"数据库",node:"节点服务",site_config:"站务配置",coupon:"优惠券",whitelist:"IP 白名单"};
const detailKeys: Record<string,string> = {
  email:"邮箱",reason:"原因",amount:"金额",note:"备注",status:"状态",to:"收件人",subject:"标题",provider:"服务商",error:"错误信息",
  scanned:"扫描数量",created:"通知数量",emailed:"邮件数量",emailFailed:"邮件失败",skipped:"跳过数量",
  requestId:"售后单号",resetOrderId:"重置账单",paidOrderId:"付款账单",refundedOrderId:"退款账单",refundAmount:"退款金额",
  sourceOrderId:"原服务订单",targetOrderId:"目标服务订单",orderId:"订单号",orderIds:"订单列表",txId:"交易流水",
  allocationId:"资源编号",allocationIds:"资源列表",resourceId:"资源编号",resourceType:"资源类型",
  host:"代理地址",port:"端口",country:"国家",city:"城市",linkedBillId:"关联账单",manual:"人工处理",
  durationDays:"服务时长",renewalDays:"续费周期",expiresAt:"到期时间",restoredExpiry:"恢复到期时间",previousStatus:"原状态",
  previousExpiresAt:"原到期时间",previousAddress:"原代理地址",address:"新代理地址",previousCountry:"原国家",previousCity:"原城市",passwordChanged:"密码是否修改",
  payable:"支付金额",discount:"优惠金额",balanceAfter:"操作后余额",creditUsed:"使用信用额度",total:"合计金额",
  product:"商品",region:"地区",count:"数量",issues:"核验异常",freeDays:"免费期限",freeCount:"免费次数",remainingFreeCount:"剩余免费次数",
};

function customerNo(id:string){const match=String(id||"").match(/^local-user-(\d+)$/i);return match?`user-${match[1]}`:String(id||"").replace(/^local-user-?/i,"user-")}
function categoryOf(log:Log):Category{const value=`${log.action} ${log.resourceType}`.toLowerCase();if(value.includes("email"))return"email";if(value.includes("scheduled")||value.includes("cron")||value.includes("task"))return"scheduled";if(value.includes("login")||value.includes("logout")||value.includes("auth")||value.includes("session"))return"login";return"system"}
function actionName(value:string){if(names[value])return names[value];const verbs:Record<string,string>={create:"创建",update:"修改",delete:"删除",login:"登录",logout:"退出",reply:"回复",approve:"批准",reject:"拒绝",refund:"退款",cancel:"取消",confirm:"确认",complete:"完成",import:"导入",adjust:"调账",sent:"发送成功",failed:"失败",run:"执行",request:"申请",pay:"支付",fulfill:"发放",replace:"更换",renew:"续费"};const translated=value.split(".").map(item=>verbs[item]||resources[item]).filter((item):item is string=>Boolean(item));return translated.length?[...new Set(translated)].join(" · "):"系统操作"}
function detailValue(value:unknown){if(value===null||value===undefined||value==="")return"无";if(typeof value==="boolean")return value?"是":"否";if(Array.isArray(value))return value.length?value.map(item=>String(item)).join("、"):"无";if(typeof value==="object")return JSON.stringify(value);if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(value)){const date=new Date(value);if(!Number.isNaN(date.getTime()))return date.toLocaleString("zh-CN",{hour12:false})}return String(value)}
function detail(log:Log){if(!log.detail)return"—";try{const value=JSON.parse(log.detail);if(log.resourceType==="email")return`${value.to||"未知收件人"} · ${value.subject||""}`;if(log.resourceType==="scheduled_task")return`扫描 ${value.scanned??0}，站内通知 ${value.created??0}，邮件 ${value.emailed??0}`;return Object.entries(value).slice(0,5).map(([key,item])=>`${detailKeys[key]||key}：${detailValue(item)}`).join("；")||"—"}catch{return"日志详情"}}
function resourceName(log:Log){const base=resources[log.resourceType]||"系统资源";if(log.resourceType==="customer"&&log.resourceCustomerName)return`客户 ${log.resourceCustomerName}`;if(log.resourceType!=="proxy")return`${base}${log.resourceId?` ${customerNo(log.resourceId)}`:""}`;if(log.resourceDisplay)return`代理资源 ${log.resourceDisplay}`;let value:any={};try{value=JSON.parse(log.detail||"{}")||{}}catch{}const address=value.address||value.previousAddress||(value.host&&value.port?`${value.host}:${value.port}`:value.host);if(address)return`代理资源 ${address}`;return log.resourceId?`代理资源 #${String(log.resourceId).slice(0,8)}`:"代理资源"}

export default function AuditClient(){
  const [items,setItems]=useState<Log[]>([]);
  const [category,setCategory]=useState<Category>("all");
  const [query,setQuery]=useState("");
  const [search,setSearch]=useState("");
  const [counts,setCounts]=useState<Record<Category,number>>({all:0,login:0,system:0,email:0,scheduled:0});
  const [page,setPage]=useState(1);
  const [size,setSize]=useState(50);
  const [total,setTotal]=useState(0);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setLoading(true);setError("");
    const params=new URLSearchParams({category,page:String(page),size:String(size)});
    if(search)params.set("search",search);
    fetch(`/api/admin/audit-logs?${params}`,{cache:"no-store"}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error||"日志加载失败");
      setItems(data.items||[]);setTotal(data.total||0);setCounts(data.counts||counts);
    }).catch(reason=>setError(reason instanceof Error?reason.message:"日志加载失败")).finally(()=>setLoading(false));
  },[category,page,size,search]);

  function switchCategory(value:Category){setCategory(value);setPage(1)}
  function submitSearch(event:React.FormEvent){event.preventDefault();setPage(1);setSearch(query.trim())}
  const pages=Math.max(1,Math.ceil(total/size));
  useEffect(()=>{document.querySelectorAll<HTMLElement>(".log-line:not(.head)").forEach((row,index)=>{const item=items[index];if(!item)return;const actor=row.children[4] as HTMLElement|undefined;if(actor&&item.actorRole!=="system")actor.textContent=item.actorName||"未设置名称";const object=row.children[5]?.querySelector("b");if(object&&item.resourceType==="customer"&&item.resourceCustomerName)object.textContent=`客户 ${item.resourceCustomerName}`})},[items]);

  return <div className="log-center">
    <div className="log-summary">{categories.map(key=><button key={key} className={category===key?"on":""} onClick={()=>switchCategory(key)}><i>{meta[key].icon}</i><span><b>{meta[key].label}</b><small>{meta[key].desc}</small></span><strong>{counts[key]}</strong></button>)}</div>
    <section className="log-panel">
      <header><div><h2>{meta[category].label}</h2><p>{meta[category].desc}，日志永久保存并按页展示</p></div><form className="log-tools" onSubmit={submitSearch}><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索操作者、操作内容、对象或 IP"/><button type="submit">搜索</button><button type="button" onClick={()=>{setQuery("");setSearch("");setPage(1)}}>清除</button></form></header>
      {error&&<div className="live-error">{error}</div>}
      {loading&&items.length===0?<div className="log-empty">正在读取日志…</div>:items.length?<div className={`log-table${loading?" is-loading":""}`} aria-busy={loading}>
        <div className="log-line head"><span>时间</span><span>日志 ID</span><span>类型</span><span>操作内容</span><span>操作者</span><span>对象 / 详情</span><span>IP 地址</span></div>
        {items.map(item=>{const type=categoryOf(item),objectName=resourceName(item),description=detail(item);return <div className="log-line" key={item.id}><span className="log-time">{new Date(item.createdAt).toLocaleString("zh-CN",{hour12:false})}</span><span className="log-id mono" title={`唯一标识：${item.id}`}>#{item.logNo}</span><span><em className={type}>{meta[type].label.replace("日志","")}</em></span><span className="log-action">{actionName(item.action)}</span><span className="log-actor">{item.actorRole==="system"?"系统任务":customerNo(item.actorId).slice(0,14)}</span><span className="log-object" title={description}><b>{objectName}</b>{description!=="—"&&<small>{description}</small>}</span><span className="mono">{item.ipAddress||"—"}</span></div>})}
      </div>:<div className="log-empty"><b>暂无{meta[category].label}</b><span>该类型产生事件后会自动记录在这里</span></div>}
      <footer className="log-pagination">
        <div className="log-page-info"><span>共 {total} 条</span><span>第 {page} / {pages} 页</span></div>
        <div className="log-page-actions">
          <label>每页显示<select value={size} onChange={event=>{const nextSize=Number(event.target.value),currentOffset=(page-1)*size;setSize(nextSize);setPage(Math.floor(currentOffset/nextSize)+1)}}><option value={20}>20 条</option><option value={50}>50 条</option><option value={100}>100 条</option></select></label>
          <button disabled={page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button>
          <button disabled={page>=pages} onClick={()=>setPage(value=>value+1)}>下一页</button>
        </div>
      </footer>
    </section>
  </div>
}
