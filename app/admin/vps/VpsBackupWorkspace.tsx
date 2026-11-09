"use client";
import {useEffect,useRef,useState} from "react";
import Pagination from "../../Pagination";
import VpsR2Settings from "./VpsR2Settings";
import {vpsBackupFileName} from "../../../scripts/vps/backup-name.mjs";
import {getR2SetupState} from "../../../lib/vps-r2-setup";
import {backupDate,backupSize,filterVpsBackups,isCurrentR2Copy,r2Status,r2UploadReason} from "../../../lib/vps-backup-view";
import type {VpsBackup,VpsServer,VpsSnapshot} from "../../../lib/vps-operations-types";
import "./vps-backup-workspace.css";

type Props={data:VpsSnapshot;loading:boolean;error:string;busy:string;pageSize:number;onPageSize:(value:number)=>void;onChanged:()=>Promise<unknown>;onRun:(action:string,body?:Record<string,unknown>)=>Promise<void>;onDownload:(backup:VpsBackup,kind:"db"|"config")=>Promise<void>;onEditPlan:(server:VpsServer)=>void};
type IconName="database"|"cloud"|"clock"|"settings"|"search"|"download"|"close"|"arrow";
function Icon({name}:{name:IconName}){
  const paths:Record<IconName,React.ReactNode>={
    database:<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>,
    cloud:<path d="M6 18a5 5 0 0 1-.5-10A7 7 0 0 1 19 7a5.5 5.5 0 0 1-1 11H6Z"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings:<><path d="m10 3-.6 2.2-2 .9-2-.7L3 9l1.6 1.6v2.8L3 15l2.4 3.6 2-.7 2 .9.6 2.2h4l.6-2.2 2-.9 2 .7L21 15l-1.6-1.6v-2.8L21 9l-2.4-3.6-2 .7-2-.9L14 3h-4Z"/><circle cx="12" cy="12" r="3"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    close:<path d="m6 6 12 12M18 6 6 18"/>,
    arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function CopyStatus({backup}:{backup:VpsBackup}){return <span data-ui="status" className={`bkp-copy-status ${backup.cloud?.status||"local"}`}><i/>{r2Status(backup)}</span>;}

export default function VpsBackupWorkspace({data,loading,error,busy,pageSize,onPageSize,onChanged,onRun,onDownload,onEditPlan}:Props){
  const [tab,setTab]=useState<"files"|"plans"|"jobs">("files");
  const [query,setQuery]=useState(""),[serverId,setServerId]=useState(""),[resultFilter,setResultFilter]=useState(""),[page,setPage]=useState(1);
  const [detailId,setDetailId]=useState<string|null>(null),[target,setTarget]=useState("all");
  const settingsDialog=useRef<HTMLDialogElement>(null),detailDialog=useRef<HTMLDialogElement>(null),createDialog=useRef<HTMLDialogElement>(null);
  const disabled=Boolean(busy||data.bridgeError);
  const setup=data.cloud?getR2SetupState(data.cloud):null;
  const files=filterVpsBackups(data.backups,{query,serverId,status:tab==="files"?resultFilter:""});
  const plans=data.servers.filter(server=>(!serverId||server.id===serverId)&&(!query||`${server.name} ${server.group}`.toLowerCase().includes(query.trim().toLowerCase())));
  const allJobs=data.jobs.filter(job=>job.kind==="backup"||job.kind==="cloud-upload");
  const jobs=allJobs.filter(job=>(!serverId||job.serverId===serverId)&&(!resultFilter||job.status===resultFilter)&&(!query||`${job.serverName} ${job.message}`.toLowerCase().includes(query.trim().toLowerCase())));
  const total=tab==="files"?files.length:tab==="plans"?plans.length:jobs.length;
  const currentPage=Math.min(page,Math.max(1,Math.ceil(total/pageSize))),start=(currentPage-1)*pageSize;
  const detail=data.backups.find(backup=>backup.id===detailId);
  const latest=[...data.backups].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
  const archived=data.backups.filter(backup=>backup.cloud?.status==="success").length;
  const failed=data.backups.filter(backup=>backup.cloud?.status==="error").length;
  const activePlans=data.servers.filter(server=>server.plan.schedule.enabled).length;
  const bytes=data.backups.reduce((sum,backup)=>sum+backup.bytes,0);
  const serverOptions=[...new Map([...data.servers.map(server=>[server.id,server.name] as const),...data.backups.filter(backup=>!data.servers.some(server=>server.id===backup.serverId)).map(backup=>[backup.serverId,`${backup.serverName}（历史）`] as const)]).entries()];
  useEffect(()=>setPage(1),[tab,query,serverId,resultFilter,pageSize]);
  useEffect(()=>{if(detailId&&detail){if(!detailDialog.current?.open)detailDialog.current?.showModal();}else detailDialog.current?.close();},[detailId,detail]);
  function openSettings(){settingsDialog.current?.showModal();}
  function openCreate(){setTarget(data.servers.length===1||!data.servers.some(server=>server.enabled)?data.servers[0]?.id||"all":"all");createDialog.current?.showModal();}
  function changeTab(value:typeof tab){setTab(value);setResultFilter("");}
  function upload(backup:VpsBackup){return onRun("upload-backup",{backupId:backup.id});}
  async function remove(backup:VpsBackup){
    if(!confirm(`永久删除 ${backup.serverName} 于 ${backupDate(backup.createdAt)} 创建的本地备份及配置副本？此操作不会删除 R2 上的副本。`))return;
    await onRun("delete-backup",{backupId:backup.id});
  }
  const uploadButton=(backup:VpsBackup)=>{
    const reason=r2UploadReason(backup,data.cloud,data.bridgeError,!!busy),current=isCurrentR2Copy(backup,data.cloud);
    return <button data-ui="action" data-ui-tone="secondary" type="button" className="bkp-upload" title={reason||"将这份本地备份加密上传到 R2"} disabled={!!reason} onClick={()=>void upload(backup)}><Icon name="cloud"/>{backup.cloud?.status==="uploading"?"上传中":current?"已上传":backup.cloud?.status==="error"?"重试 R2":"上传 R2"}</button>;
  };

  return <div className="bkp-workspace" aria-busy={loading}>
    <header className="bkp-heading"><div><span className="bkp-eyebrow">BACKUP CENTER</span><h2>备份管理</h2><p>本地备份、异地副本和自动计划，在这里统一管理。</p></div><div className="bkp-heading-actions"><button data-ui="action" data-ui-tone="secondary" type="button" onClick={openSettings} disabled={!data.cloud}><Icon name="settings"/>R2 设置</button><button data-ui="action" data-ui-tone="primary" type="button" className="primary" disabled={disabled||loading||!data.servers.length} onClick={openCreate}><span aria-hidden="true">＋</span>新建备份</button></div></header>
    {error&&<div className="bkp-alert error" role="alert">{error}</div>}
    {data.bridgeError&&<div className="bkp-alert error" role="alert">{data.bridgeError}。请检查连接桥后重试；已有配置不会被清空。</div>}

    <section className="bkp-summary" aria-label="备份概况">
      <article><span className="bkp-metric-icon"><Icon name="database"/></span><div><span>本地备份</span><strong>{loading?"—":data.backups.length}<small>份</small></strong><p>数据库共 {backupSize(bytes)}</p></div></article>
      <article><span className="bkp-metric-icon green"><Icon name="cloud"/></span><div><span>已上传 R2</span><strong>{loading?"—":archived}<small>份</small></strong><p className={failed?"bkp-warning":""}>{failed?`${failed} 份上传失败，可手动重试`:"云端副本独立保留"}</p></div></article>
      <article><span className="bkp-metric-icon violet"><Icon name="clock"/></span><div><span>自动备份计划</span><strong>{loading?"—":activePlans}<small>/ {data.servers.length} 台</small></strong><p>按北京时间执行</p></div></article>
      <article className="bkp-latest"><div><span>最近一次备份</span><strong>{latest?backupDate(latest.createdAt,"time"):"—"}</strong><p>{latest?`${backupDate(latest.createdAt,"date")} · ${latest.serverName}`:"暂无备份记录"}</p></div></article>
    </section>

    <section className={`bkp-protection ${data.cloud?.enabled?"enabled":"pending"}`} aria-label="R2 异地保护状态">
      <span className="bkp-protection-icon"><Icon name="cloud"/></span><div><strong>{loading?"正在读取异地备份配置…":data.cloud?.enabled?"R2 异地保护已启用":setup&&!setup.keyReady?"还差一步准备：下载并保管解密密钥":"R2 异地保护尚未启用"}</strong><p>{data.cloud?.enabled?`新备份自动加密上传至 ${data.cloud.bucket}；本地文件继续保留。`:setup&&!setup.keyReady?"访问密钥不等于解密密钥。完成设置后才能上传，本地备份仍可正常使用。":"完成 R2 配置并保存启用后，新备份会自动上传。"}</p></div><button data-ui="action" data-ui-tone="secondary" type="button" onClick={openSettings} disabled={!data.cloud}>{data.cloud?.enabled?"管理设置":"继续配置"}<Icon name="arrow"/></button>
    </section>

    <section className="bkp-library" aria-label="备份管理">
      <div className="bkp-library-top"><div className="bkp-tabs" role="tablist" aria-label="备份管理视图">{([{id:"files",label:"备份文件",count:data.backups.length},{id:"plans",label:"自动备份计划",count:data.servers.length},{id:"jobs",label:"最近任务",count:allJobs.length}] as const).map(item=><button type="button" role="tab" id={`bkp-tab-${item.id}`} aria-controls={`bkp-panel-${item.id}`} aria-selected={tab===item.id} className={tab===item.id?"active":""} key={item.id} onClick={()=>changeTab(item.id)}>{item.label}<span>{item.count}</span></button>)}</div><span className="bkp-update-note">北京时间 · 每 15 秒更新</span></div>
      <div className="bkp-toolbar"><label className="bkp-search"><Icon name="search"/><input aria-label="搜索备份" placeholder={tab==="files"?"搜索面板、文件名或摘要":tab==="plans"?"搜索面板名称或分组":"搜索面板或任务结果"} value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label="按面板筛选" value={serverId} onChange={event=>setServerId(event.target.value)}><option value="">全部面板（含历史）</option>{serverOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select>{tab!=="plans"&&<select aria-label={tab==="files"?"按副本状态筛选":"按任务结果筛选"} value={resultFilter} onChange={event=>setResultFilter(event.target.value)}><option value="">{tab==="files"?"全部副本状态":"全部任务结果"}</option>{tab==="files"?<><option value="local">仅本地</option><option value="uploading">上传中</option><option value="error">上传失败</option><option value="success">已加密上传</option></>:<><option value="running">进行中</option><option value="error">失败</option><option value="success">已完成</option></>}</select>}</div>
      <div role="tabpanel" id={`bkp-panel-${tab}`} aria-labelledby={`bkp-tab-${tab}`}>
        {loading?<div className="bkp-empty"><Icon name="database"/><strong>正在加载备份数据…</strong></div>:tab==="files"?<>
          <div className="bkp-record-heading" aria-hidden="true"><span>序号</span><span>备份文件</span><span>生成时间 / 大小</span><span>R2 异地副本</span><span>操作</span></div>
          <div className="bkp-records" role="list" aria-label="备份文件列表">{files.slice(start,start+pageSize).map((backup,index)=><article className="bkp-record" role="listitem" key={backup.id}>
            <span className="bkp-serial">{start+index+1}</span>
            <button type="button" className="bkp-file" onClick={()=>setDetailId(backup.id)} title={vpsBackupFileName(backup)}><span className="bkp-file-icon"><Icon name="database"/></span><span><strong>{backup.serverName}</strong><small>{vpsBackupFileName(backup)}</small><em>数据库{backup.hasConfig?" + Xray 配置":""}{backup.warning?" · 含导出提示":""}</em></span></button>
            <div className="bkp-record-meta"><time dateTime={backup.createdAt}>{backupDate(backup.createdAt,"date")}<span>{backupDate(backup.createdAt,"time")}</span></time><small>{backupSize(backup.bytes)}</small></div>
            <div className="bkp-record-protection"><CopyStatus backup={backup}/><small>{backup.cloud?.status==="success"?"本地 + 云端双副本":backup.cloud?.status==="error"?"本地已保留，请查看详情":backup.cloud?.status==="uploading"?"本地已保存，请稍候":"本地已保存"}</small></div>
            <div className="bkp-record-actions"><button data-ui="action" data-ui-tone="secondary" type="button" disabled={disabled} onClick={()=>void onDownload(backup,"db")}><Icon name="download"/>数据库</button>{uploadButton(backup)}<button data-ui="action" data-ui-tone="secondary" type="button" className="bkp-detail-button" aria-label={`查看 ${backup.serverName} ${backupDate(backup.createdAt)} 备份详情`} onClick={()=>setDetailId(backup.id)}>详情</button></div>
          </article>)}</div>
          {!files.length&&<div className="bkp-empty"><Icon name="database"/><strong>{data.backups.length?"没有匹配的备份":"还没有备份文件"}</strong><p>{data.backups.length?"试试调整搜索或筛选条件。":"点击「新建备份」生成第一份本地备份，再按需设置异地保护。"}</p></div>}
          {!data.cloud?.enabled&&!!files.length&&<div className="bkp-inline-note"><Icon name="cloud"/><span>R2 尚未启用，上传按钮暂不可用。本地下载不受影响。</span><button data-ui="action" data-ui-tone="secondary" type="button" onClick={openSettings}>去完成设置</button></div>}
        </>:tab==="plans"?<>
          <div className="bkp-section-note">自动计划默认关闭；只在新备份成功后清理旧版本。关闭浏览器后仍按后台调度执行。</div>
          <div className="bkp-plan-list" role="list" aria-label="自动备份计划列表">{plans.slice(start,start+pageSize).map(server=><article className="bkp-plan" role="listitem" key={server.id}><span className={`bkp-plan-indicator ${server.plan.schedule.enabled?"on":""}`}><Icon name="clock"/></span><div className="bkp-plan-name"><strong>{server.name}</strong><small>{server.group||"未分组"}</small></div><div><span>执行周期</span><strong>{!server.plan.schedule.enabled?"仅手动备份":server.plan.schedule.kind==="interval"?`每 ${server.plan.schedule.hours} 小时`:`每天 ${server.plan.schedule.time}`}</strong></div><div><span>本地保留</span><strong>{server.plan.schedule.retain} 份</strong></div><div><span>下次执行 · 北京时间</span><strong>{backupDate(server.plan.nextBackupAt)}</strong></div><div className="bkp-plan-actions"><button data-ui="action" data-ui-tone="secondary" type="button" disabled={!!busy} onClick={()=>onEditPlan(server)}>编辑计划</button><button data-ui="action" data-ui-tone="secondary" type="button" disabled={disabled} onClick={()=>void onRun("backup",{serverId:server.id})}>立即备份</button></div></article>)}</div>
          {!plans.length&&<div className="bkp-empty"><Icon name="clock"/><strong>没有匹配的面板</strong><p>请调整筛选，或先在「面板与流量」中添加面板。</p></div>}
        </>:<>
          <div className="bkp-section-note">仅展示面板备份与 R2 上传任务，完整连接检测记录可在「VPS 运维 → 运维记录」查看。</div>
          <div className="bkp-task-list" role="list" aria-label="备份任务列表">{jobs.slice(start,start+pageSize).map(job=><article className="bkp-task" role="listitem" key={job.id}><span className={`bkp-task-dot ${job.status}`}/><div><strong>{job.serverName}<small>{job.kind==="cloud-upload"?"R2 加密上传":"面板备份"}</small></strong><p>{job.message}</p></div><div className="bkp-task-meta"><span data-ui="status" className={`bkp-copy-status ${job.status}`}>{job.status==="success"?"已完成":job.status==="error"?"失败":"进行中"}</span><time dateTime={job.startedAt}>{backupDate(job.startedAt)}</time><small>{job.trigger==="schedule"?"后台调度":"手动操作"}</small></div></article>)}</div>
          {!jobs.length&&<div className="bkp-empty"><Icon name="clock"/><strong>暂无匹配的任务记录</strong></div>}
        </>}
      </div>
      {!loading&&<Pagination total={total} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={onPageSize}/>}
    </section>
    <footer className="bkp-footnote"><span><Icon name="database"/>本地文件随 backups 目录持久化；清理本地不会删除 R2 副本。</span><details><summary>存储与恢复说明</summary><p>本地目录：<code>{data.storage?.directory||"/app/backups/vps"}</code>。文件包含面板数据库及可用的 Xray 配置，不是整机镜像。超出本地保留范围的 R2 文件需从 Cloudflare 控制台下载，再用离线工具解密。</p></details></footer>

    <dialog className="bkp-drawer" aria-labelledby="bkp-settings-title" ref={settingsDialog}><header className="bkp-dialog-heading"><div><span>OFFSITE STORAGE</span><h3 id="bkp-settings-title">R2 异地备份设置</h3><p>配置、密钥保管与启用状态集中在这里。</p></div><button type="button" className="bkp-close" aria-label="关闭 R2 设置" onClick={()=>settingsDialog.current?.close()}><Icon name="close"/></button></header><div className="bkp-drawer-content">{data.cloud&&<VpsR2Settings settings={data.cloud} onChanged={onChanged} bridgeUnavailable={Boolean(data.bridgeError)}/>}</div></dialog>

    <dialog className="bkp-detail-dialog" aria-labelledby="bkp-detail-title" ref={detailDialog} onClose={()=>setDetailId(null)}>{detail&&<><header className="bkp-dialog-heading"><div><span>BACKUP DETAILS</span><h3 id="bkp-detail-title">{detail.serverName}</h3><p>{backupDate(detail.createdAt)} · 北京时间</p></div><button type="button" className="bkp-close" aria-label="关闭备份详情" onClick={()=>detailDialog.current?.close()}><Icon name="close"/></button></header><div className="bkp-detail-body">{error&&<p className="bkp-alert error" role="alert">{error}</p>}<section><h4>本地文件</h4><dl><div><dt>数据库</dt><dd>{vpsBackupFileName(detail)}</dd></div><div><dt>文件大小</dt><dd>{backupSize(detail.bytes)}</dd></div><div><dt>Xray 配置</dt><dd>{detail.hasConfig?vpsBackupFileName(detail,"config"):"本次没有可用的配置副本"}</dd></div><div><dt>SHA-256</dt><dd className="bkp-hash">{detail.sha256}</dd></div></dl>{detail.warning&&<p className="bkp-alert">{detail.warning}</p>}</section><section><h4>R2 异地副本 <CopyStatus backup={detail}/></h4><dl><div><dt>存储桶</dt><dd>{detail.cloud?.bucket||"尚未上传"}</dd></div><div><dt>对象路径</dt><dd className="bkp-hash">{detail.cloud?.objectKey||"—"}</dd></div><div><dt>完成时间</dt><dd>{backupDate(detail.cloud?.uploadedAt)}</dd></div></dl>{detail.cloud?.error&&<p className="bkp-alert error">{detail.cloud.error}</p>}{!data.cloud?.enabled&&<p className="bkp-detail-tip">R2 尚未启用；先完成异地备份设置，才可上传这份备份。</p>}</section><details className="bkp-danger-zone"><summary>删除本地备份</summary><p>永久删除这份本地数据库及配置。此操作不会删除 R2 副本，也不会影响正在运行的 VPS。</p><button data-ui="action" data-ui-tone="danger" type="button" disabled={disabled||detail.cloud?.status==="uploading"} onClick={()=>void remove(detail)}>删除这份本地备份</button></details></div><footer className="bkp-dialog-footer"><div><button data-ui="action" data-ui-tone="secondary" type="button" disabled={disabled} onClick={()=>void onDownload(detail,"db")}><Icon name="download"/>下载数据库</button>{detail.hasConfig&&<button data-ui="action" data-ui-tone="secondary" type="button" disabled={disabled} onClick={()=>void onDownload(detail,"config")}>Xray 配置</button>}</div>{uploadButton(detail)}</footer></>}</dialog>

    <dialog className="bkp-create-dialog" aria-labelledby="bkp-create-title" ref={createDialog}><header className="bkp-dialog-heading"><div><span>NEW BACKUP</span><h3 id="bkp-create-title">新建面板备份</h3><p>先生成本地文件，再按 R2 设置决定是否自动上传。</p></div><button type="button" className="bkp-close" aria-label="关闭新建备份" onClick={()=>createDialog.current?.close()}><Icon name="close"/></button></header><form onSubmit={event=>{event.preventDefault();createDialog.current?.close();void onRun(target==="all"?"backup-all":"backup",target==="all"?{}:{serverId:target});}}><div className="bkp-create-body"><label>选择备份面板<select value={target} onChange={event=>setTarget(event.target.value)}>{data.servers.some(server=>server.enabled)&&<option value="all">所有已启用面板（{data.servers.filter(server=>server.enabled).length} 台）</option>}{data.servers.map(server=><option value={server.id} key={server.id}>{server.name}</option>)}</select></label><p>不会重启面板或修改客户服务。结果可在「最近任务」中查看。</p></div><footer className="bkp-dialog-footer"><button data-ui="action" data-ui-tone="text" type="button" onClick={()=>createDialog.current?.close()}>取消</button><button data-ui="action" data-ui-tone="primary" className="primary" disabled={disabled||!data.servers.length||(target==="all"&&!data.servers.some(server=>server.enabled))}>开始备份</button></footer></form></dialog>
  </div>;
}
