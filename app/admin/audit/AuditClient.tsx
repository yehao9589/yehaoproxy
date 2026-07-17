"use client";
import {useEffect,useState} from "react";

type Log={id:string;actorId:string;actorRole:string;action:string;resourceType:string;resourceId:string|null;ipAddress:string|null;createdAt:string};
const actions:Record<string,string>={"admin.create":"创建管理员","customer.update":"修改客户资料","customer.credit.update":"调整客户信用额度","customer.impersonate":"管理员登录客户面板","wallet.adjust":"客户余额调账","order.confirm":"确认订单收款","order.cancel":"取消订单","order.fulfill":"提取并发放代理","order.refund":"订单退款","order.update":"修改订单信息","order.service_update":"修改订单服务配置","proxy.update":"修改代理资料","proxy.bulk_credentials":"批量修改代理账号密码","proxy.bulk_renew_request":"提交批量续费申请","service.renew.create":"申请代理续费","service.replace.create":"申请更换代理","service.renew.complete":"完成代理续费","service.replace.complete":"完成代理更换","service.reject":"拒绝售后申请","ticket.reply":"回复客户工单","inventory.import":"导入代理库存","inventory.update":"修改库存资源"};
const resources:Record<string,string>={admin:"管理员",customer:"客户",wallet:"钱包",order:"订单",proxy:"代理资源",inventory:"库存资源",service_request:"售后申请",ticket:"工单",notification:"通知"};
const roles:Record<string,string>={admin:"管理员",customer:"客户",system:"系统"};
const extraActions:Record<string,string>={"order.manual_extraction_required":"库存不足，转人工开通","order.wallet_credit_pay":"使用余额与信用额度支付订单","order.request_extraction":"客户申请提取代理资源"};
function actionLabel(value:string){if(extraActions[value])return extraActions[value];if(actions[value])return actions[value];const parts=value.split(".").map(x=>resources[x]||({create:"创建",update:"修改",delete:"删除",login:"登录",logout:"退出",reply:"回复",approve:"批准",reject:"拒绝",refund:"退款",cancel:"取消",confirm:"确认",complete:"完成",import:"导入",adjust:"调账",manual:"人工",extraction:"提取",required:"需要",request:"申请",credit:"信用额度",pay:"支付"} as Record<string,string>)[x]||x);return parts.join(" · ")}

export default function AuditClient(){
  const[items,setItems]=useState<Log[]>([]),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/admin/audit-logs?size=100").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"日志加载失败");setItems(d.items||[])}).catch(e=>setError(e.message))},[]);
  return <div className="standalone-admin"><header><a href="/admin">← 返回后台</a><h1>操作审计日志</h1></header>{error&&<div className="live-error">{error}</div>}<div className="standalone-table audit-table"><div className="logrow head"><span>时间</span><span>操作者</span><span>角色</span><span>操作内容</span><span>操作对象</span><span>IP 地址</span></div>{items.map(x=><div className="logrow" key={x.id}><span>{new Date(x.createdAt).toLocaleString("zh-CN")}</span><span className="mono">{x.actorId.slice(0,12)}…</span><span>{roles[x.actorRole]||x.actorRole}</span><span title={x.action}>{actionLabel(x.action)}</span><span>{resources[x.resourceType]||x.resourceType} {x.resourceId?.slice(0,10)||""}</span><span>{x.ipAddress||"—"}</span></div>)}</div></div>;
}
