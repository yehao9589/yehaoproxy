"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {AdminRefreshButton,useAdminRefresh} from "../AdminRefresh";
import Pagination from "../../Pagination";
import {usePageSize} from "../../usePageSize";
import {vpsBackupFileName} from "../../../scripts/vps/backup-name.mjs";
import type {VpsBackupPlan,VpsBackupSchedule} from "../../../lib/vps-backup-plan";
import "./vps-operations.css";
import VpsBackupWorkspace from "./VpsBackupWorkspace";
import type {VpsServer as Server,VpsBackup as Backup,VpsSnapshot as Snapshot} from "../../../lib/vps-operations-types";

const empty:Snapshot={servers:[],statuses:{},backups:[],jobs:[]};
const size=(value=0)=>{if(value<1024)return `${value} B`;const n=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));return `${(value/1024**n).toFixed(n>1?1:0)} ${["B","KB","MB","GB","TB"][n]}`;};
const time=(value?:string|null)=>value?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)):"—";
const planText=(plan:VpsBackupPlan)=>!plan.schedule.enabled?"未启用":plan.schedule.kind==="interval"?`每 ${plan.schedule.hours} 小时`:`每天 ${plan.schedule.time}`;

export default function VpsOperations({view}:{view:"overview"|"backups"|"jobs"}){
  const [data,setData]=useState<Snapshot>(empty),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const [query,setQuery]=useState(""),[serverFilter,setServerFilter]=useState(""),[jobFilter,setJobFilter]=useState("");
  const [editor,setEditor]=useState<Server|null>(null),[schedule,setSchedule]=useState<VpsBackupSchedule|null>(null),[formError,setFormError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  const [observedAt,setObservedAt]=useState(0);
  const [pageSize,setPageSize]=usePageSize(),[page,setPage]=useState(1);
  useEffect(()=>{setPage(1)},[view,query,serverFilter,jobFilter,pageSize]);
  const toast=(message:string)=>window.dispatchEvent(new CustomEvent("yehao:toast",{detail:{kind:"success",message}}));
  const load=useCallback(async()=>{try{const response=await fetch("/api/admin/vps-operations",{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"VPS 运维数据加载失败");setData(body);setError("");}catch(reason){setError(reason instanceof Error?reason.message:"加载失败");return false;}finally{setObservedAt(Date.now());setLoading(false);}},[]);
  useAdminRefresh(load);
  useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},15000);return()=>window.clearInterval(timer);},[load]);
  useEffect(()=>{if(editor)dialog.current?.showModal();},[editor]);
  const filtered=data.servers.filter(server=>(!query||`${server.name} ${server.group} ${server.baseUrl}`.toLowerCase().includes(query.toLowerCase()))&&(!serverFilter||server.id===serverFilter));
  const jobs=data.jobs.filter(item=>(!serverFilter||item.serverId===serverFilter)&&(!jobFilter||item.status===jobFilter));
  const rows=view==="overview"?filtered:jobs;
  const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)));
  const start=(currentPage-1)*pageSize;
  const pageServers=filtered.slice(start,start+pageSize),pageJobs=jobs.slice(start,start+pageSize);
  const pager=<Pagination total={rows.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>;
  const totals=useMemo(()=>({online:data.servers.filter(server=>data.statuses[server.id]?.online&&observedAt-Date.parse(data.statuses[server.id].checkedAt)<300000).length,used:data.servers.reduce((sum,server)=>sum+(server.lastMetrics?.used||0),0),bytes:data.backups.reduce((sum,item)=>sum+item.bytes,0)}),[data,observedAt]);
  const disabled=Boolean(busy||data.bridgeError);

  async function post(action:string,body:Record<string,unknown>={}){
    const response=await fetch("/api/admin/vps-operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...body})}),result=await response.json();
    if(!response.ok)throw new Error(result.error||"操作失败");return result;
  }
  async function run(action:string,body:Record<string,unknown>={}){
    if(busy)return;setBusy(`${action}:${body.serverId||body.backupId||"all"}`);setError("");
    try{const result=await post(action,body);await load();const failed=Array.isArray(result.data)?result.data.filter((item:{ok:boolean})=>!item.ok):[];
      if(failed.length)setError(`${result.message}；${failed.map((item:{serverId:string;error:string})=>`${data.servers.find(server=>server.id===item.serverId)?.name||item.serverId}：${item.error}`).join("；")}`);else toast(result.message);
    }catch(reason){setError(reason instanceof Error?reason.message:"操作失败");}finally{setBusy("");}
  }
  function edit(server:Server){setEditor(server);setSchedule({...server.plan.schedule});setFormError("");}
  async function savePlan(event:React.FormEvent){event.preventDefault();if(!editor||!schedule||busy)return;setBusy("save-plan");setFormError("");try{await post("save-plan",{serverId:editor.id,schedule});setEditor(null);toast("自动备份计划已保存");await load();}catch(reason){setFormError(reason instanceof Error?reason.message:"保存失败");}finally{setBusy("");}}
  async function download(backup:Backup,kind:"db"|"config"){
    const url=`/api/admin/vps-operations?download=${encodeURIComponent(backup.id)}&kind=${kind}`;
    setError("");try{const response=await fetch(url,{method:"HEAD",cache:"no-store"});if(!response.ok)throw new Error("无法下载备份，请确认登录状态与服务器上的备份文件");const anchor=document.createElement("a");anchor.href=url;anchor.download=vpsBackupFileName(backup,kind);document.body.appendChild(anchor);anchor.click();anchor.remove();}catch(reason){setError(reason instanceof Error?reason.message:"下载失败");}
  }
  function status(server:Server){const value=data.statuses[server.id],fresh=value&&observedAt-Date.parse(value.checkedAt)<300000;return <span data-ui="status" className={`vops-status ${fresh?(value.online?"ok":"bad"):"waiting"}`} title={value?.error||""}>{!value?"待检测":!fresh?"待刷新":value.online?"已连接":"连接异常"}</span>;}
  function resources(server:Server){const value=data.statuses[server.id];if(!value?.online||observedAt-Date.parse(value.checkedAt)>=300000||!value.metrics)return <span className="vops-muted">等待检测数据</span>;const memory=value.metrics.mem;return <div className="vops-resources"><span>CPU <b>{(value.metrics.cpu||0).toFixed(0)}%</b></span><span>内存 <b>{memory?.total?`${(memory.current/memory.total*100).toFixed(0)}%`:"—"}</b></span></div>;}

  const planEditor=editor&&schedule&&<dialog className="vops-dialog" aria-labelledby="vops-plan-title" ref={dialog} onCancel={()=>setEditor(null)}><form onSubmit={savePlan}><header><div><h3 id="vops-plan-title">{editor.name} · 备份计划</h3><p>按北京时间执行；仅在新备份成功后清理旧版本。</p></div><button type="button" aria-label="关闭备份计划" onClick={()=>setEditor(null)}>×</button></header><div className="vops-form"><div className="vops-schedule-switch"><span><b>自动备份</b><small>{schedule.enabled?"按下方周期自动执行":"已关闭，仅手动备份"}</small></span><button type="button" role="switch" aria-label="启用自动备份" aria-checked={schedule.enabled} disabled={!!busy} className={`policy-toggle${schedule.enabled?" on":""}`} onClick={()=>setSchedule({...schedule,enabled:!schedule.enabled})}><i/></button></div><label>执行方式<select value={schedule.kind} onChange={event=>setSchedule({...schedule,kind:event.target.value as "daily"|"interval"})}><option value="daily">每日定时</option><option value="interval">固定间隔</option></select></label>{schedule.kind==="daily"?<label>北京时间<input type="time" required value={schedule.time} onChange={event=>setSchedule({...schedule,time:event.target.value})}/></label>:<label>间隔小时数<input type="number" min="1" max="720" required value={schedule.hours} onChange={event=>setSchedule({...schedule,hours:Number(event.target.value)})}/></label>}<label>保留备份数量<input type="number" min="1" max="100" required value={schedule.retain} onChange={event=>setSchedule({...schedule,retain:Number(event.target.value)})}/></label><p>关闭浏览器后仍会执行。已有计划修改保留数量时，不改变下次执行时间。</p>{formError&&<div role="alert" className="vops-notice error">{formError}</div>}</div><footer><button data-ui="action" data-ui-tone="text" type="button" onClick={()=>setEditor(null)}>取消</button><button data-ui="action" data-ui-tone="primary" className="primary" disabled={!!busy}>保存计划</button></footer></form></dialog>;
  if(view==="backups")return <div className="vops bkp-host"><VpsBackupWorkspace data={data} loading={loading} error={error} busy={busy} pageSize={pageSize} onPageSize={setPageSize} onChanged={load} onRun={run} onDownload={download} onEditPlan={edit}/>{planEditor}</div>;

  return <div className="vops business-page"><section className="business-hero vops-hero"><div><small>VPS OPERATIONS</small><h2>{view==="overview"?"VPS 运行概览":"VPS 运维记录"}</h2><p>{view==="overview"?"集中查看运行状态、已有流量统计与备份计划。":"查看手动操作与自动调度的逐台执行结果。"}</p></div><div className="vops-actions"><AdminRefreshButton/>{view==="overview"&&<button data-ui="action" data-ui-tone="secondary" disabled={disabled||!data.servers.length} onClick={()=>void run("check-all")}>检测全部</button>}{view!=="jobs"&&<button data-ui="action" data-ui-tone="primary" className="primary" disabled={disabled||!data.servers.length} onClick={()=>void run("backup-all")}>备份已启用面板</button>}</div></section>
    {error&&<div className="vops-notice error" role="alert">{error}</div>}{data.bridgeError&&<div className="vops-notice error">{data.bridgeError}。更新镜像并重建单容器后，新版连接桥会自动启动。</div>}
    {view!=="jobs"&&<div className="vops-kpis"><article><span>管理面板</span><b>{data.servers.length}<small>台</small></b><em>{data.servers.filter(server=>server.enabled).length} 台启用自动同步</em></article><article><span>最近连接正常</span><b>{totals.online}<small>/ {data.servers.length}</small></b><em>以最近 5 分钟的检测结果为准</em></article><article><span>服务器统计流量</span><b>{size(totals.used)}</b><em>非客户计费用量 · 沿用服务器统计周期</em></article><article><span>本地备份</span><b>{data.backups.length}<small>份</small></b><em>数据库文件共 {size(totals.bytes)}</em></article></div>}
    <div className="vops-filter"><label className="vops-search">{view==="overview"?<input aria-label="搜索 VPS" placeholder="搜索名称、分组或面板地址" value={query} onChange={event=>setQuery(event.target.value)}/>:<select aria-label="按面板筛选" value={serverFilter} onChange={event=>setServerFilter(event.target.value)}><option value="">所有面板与历史记录</option>{data.servers.map(server=><option key={server.id} value={server.id}>{server.name}</option>)}</select>}</label>{view==="jobs"&&<select aria-label="按任务结果筛选" value={jobFilter} onChange={event=>setJobFilter(event.target.value)}><option value="">全部任务结果</option><option value="running">进行中</option><option value="success">已完成</option><option value="error">失败</option></select>}<span>北京时间 · 每 15 秒刷新页面</span></div>
    {loading?<div className="vops-empty">正在加载 VPS 数据…</div>:view==="overview"?<section className="vops-card"><header><h3>面板运行状态</h3><span>{filtered.length} 台</span></header><div className="vops-scroll"><table><thead><tr><th>序号</th><th>面板</th><th>连接状态</th><th>资源使用</th><th>Xray</th><th>最近检测</th><th>自动备份</th><th>操作</th></tr></thead><tbody>{pageServers.map((server,index)=><tr key={server.id}><td>{start+index+1}</td><td><b>{server.name}</b><small>{server.group||"未分组"} · {server.baseUrl}</small></td><td>{status(server)}</td><td>{resources(server)}</td><td><b>{data.statuses[server.id]?.metrics?.xray?.state||"—"}</b><small>{data.statuses[server.id]?.metrics?.xray?.version||""}</small></td><td>{time(data.statuses[server.id]?.checkedAt)}</td><td><b>{planText(server.plan)}</b><small>{server.plan.nextBackupAt?`下次 ${time(server.plan.nextBackupAt)}`:"可按需启用"}</small></td><td><div className="vops-row-actions"><button data-ui="action" data-ui-tone="secondary" disabled={disabled} onClick={()=>void run("check",{serverId:server.id})}>检测</button><button data-ui="action" data-ui-tone="secondary" disabled={disabled} onClick={()=>void run("backup",{serverId:server.id})}>备份</button><button data-ui="action" data-ui-tone="secondary" disabled={!!busy} onClick={()=>edit(server)}>计划</button></div></td></tr>)}</tbody></table></div>{pager}{!filtered.length&&<div className="vops-empty">{data.servers.length?"没有符合条件的面板":"请先在「面板与流量」中添加 X-Panel 服务器。"}</div>}</section>:<section className="vops-card"><header><h3>最近运维任务</h3><span>最多显示最近 200 条记录</span></header><div className="vops-scroll"><table><thead><tr><th>序号</th><th>面板</th><th>任务</th><th>来源</th><th>状态</th><th>开始时间</th><th>结果</th></tr></thead><tbody>{pageJobs.map((job,index)=><tr key={job.id}><td>{start+index+1}</td><td><b>{job.serverName}</b></td><td>{job.kind==="backup"?"面板备份":job.kind==="cloud-upload"?"R2 加密上传":"连接检测"}</td><td>{job.trigger==="schedule"?"后台调度":"手动操作"}</td><td><span data-ui="status" className={`vops-status ${job.status==="success"?"ok":job.status==="error"?"bad":"waiting"}`}>{job.status==="success"?"已完成":job.status==="error"?"失败":"进行中"}</span></td><td>{time(job.startedAt)}</td><td className="vops-job-message">{job.message}</td></tr>)}</tbody></table></div>{pager}{!jobs.length&&<div className="vops-empty">暂无符合条件的任务记录。</div>}</section>}
    <p className="vops-footnote">后台调度沿用「系统管理 → 定时任务」所选运行方式。备份存储于 {data.storage?.directory||"/app/backups/vps"}，随现有 backups 目录持久化。R2 副本不随本地清理而删除；超出本地保留范围的云端文件可从 Cloudflare 控制台下载，再用离线工具解密。</p>
    {planEditor}
  </div>;
}
