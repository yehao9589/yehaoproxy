"use client";

import { useEffect, useState } from "react";

type Backup={id:string;kind?:string;status:string;createdAt:string;message:string;checksum?:string;database?:string};
type Release={version:string;publishedAt?:string;title?:string;notes?:string[]};
type Data={runtime:{currentVersion:string;image:string;commit:string;deployment:string};source:{repository:string;image:string;channel:string};executor:{ready:boolean;running:boolean;history:Backup[]}};
type CheckResult={currentVersion:string;remoteVersion:string;hasUpdate:boolean;releaseNotes:string;publishedAt:string;releases?:Release[]};

export default function UpdateCenter(){
  const [data,setData]=useState<Data|null>(null);
  const [result,setResult]=useState<CheckResult|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    const response=await fetch("/api/admin/update-center",{cache:"no-store"});
    const value=await response.json();
    if(response.ok)setData(value);else setMessage(value.error||"更新与备份页面加载失败");
  }
  useEffect(()=>{void load();},[]);
  async function call(body:Record<string,unknown>){
    setBusy(String(body.action));setMessage("");
    const response=await fetch("/api/admin/update-center",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const value=await response.json();setBusy("");
    if(!response.ok){setMessage(value.error||"操作失败");return null}return value;
  }
  async function check(){const value=await call({action:"check"});if(value){setResult(value);setMessage(value.hasUpdate?`发现新版本 ${value.remoteVersion}`:"当前已经是最新版本")}}
  async function createBackup(){
    if(!confirm("确定立即创建完整系统备份吗？"))return;
    const value=await call({action:"backup"});
    if(value){setMessage("备份创建成功，可在下方下载保存");await load()}
  }
  async function rollback(id:string){
    if(!confirm(`确定恢复备份 ${id} 吗？恢复会覆盖当前数据库和上传文件。`))return;
    const value=await call({action:"rollback",backupId:id});if(value){setMessage(value.message||"恢复任务已提交");setTimeout(()=>void load(),1200)}
  }
  async function importBackup(file:File){
    if(!file.name.toLowerCase().endsWith(".tar.gz")){setMessage("请选择 .tar.gz 备份文件");return}
    setBusy("import");const response=await fetch("/api/admin/update-center",{method:"POST",headers:{"content-type":"application/gzip","x-backup-filename":file.name},body:file});
    const value=await response.json();setBusy("");if(!response.ok){setMessage(value.error||"导入失败");return}setMessage("备份文件已导入");await load();
  }
  async function deleteBackup(id:string){
    if(!confirm(`确定永久删除备份 ${id} 吗？删除后无法恢复。`))return;
    const value=await call({action:"delete-backup",backupId:id});
    if(value){setMessage("备份已删除");await load()}
  }
  const statuses:Record<string,string>={backed_up:"可恢复",rolling_back:"正在恢复",restored:"恢复成功",restore_failed:"恢复失败",completed:"更新成功"};
  const kinds:Record<string,string>={manual:"手动备份",update:"更新前备份",safety:"恢复前保护点",imported:"导入备份"};
  const releases=result?.releases?.length?result.releases:(result?[{version:result.remoteVersion,publishedAt:result.publishedAt,title:"当前发布版本",notes:result.releaseNotes.split("\n").filter(Boolean)}]:[]);

  if(!data)return <div className="setting-card">{message||"正在加载更新与备份…"}</div>;
  return <div className="update-center">
    {message&&<div className="settings-toast">{message}</div>}
    <section className="update-hero">
      <div><span>当前版本</span><b>{data.runtime.currentVersion}</b><small>{data.runtime.commit?`提交 ${data.runtime.commit}`:"预发布版本"}</small></div>
      <div><span>部署方式</span><b>{data.runtime.deployment||"Docker 容器"}</b><small>{data.source.image}</small></div>
      <div><span>更新来源</span><b>自动跟随部署源</b><small>GitHub · {data.source.channel}</small></div>
      <button onClick={check} disabled={Boolean(busy)}>{busy==="check"?"检查中…":"检查更新"}</button>
    </section>

    <section className="setting-card release-notes-card">
      <div className="setting-title"><div><h2>版本更新说明</h2><p>更新源由系统根据当前部署方式自动识别，无需手动填写仓库、分支或镜像地址。</p></div><span>{result?`${result.remoteVersion}${result.hasUpdate?" 可更新":" 已是最新"}`:"点击上方检查"}</span></div>
      {!releases.length?<div className="update-empty">点击“检查更新”读取最新版本及更新内容。</div>:<div className="release-timeline">{releases.map(item=><article key={`${item.version}-${item.publishedAt||""}`}><div><b>{item.version}</b><time>{item.publishedAt||"未标注日期"}</time></div><section><h3>{item.title||"版本更新"}</h3><ul>{(item.notes||[]).map((note,index)=><li key={`${item.version}-${index}`}>{note}</li>)}</ul></section></article>)}</div>}
      <div className="managed-update-note">检测到新版本后，请在宝塔容器编排中点击“更新镜像”。系统数据保存在挂载目录中，不会随容器重建丢失。</div>
    </section>

    <section className="setting-card update-history system-backup-card">
      <div className="setting-title"><div><h2>系统备份与灾难恢复</h2><p>备份宝塔 MySQL 数据、上传文件及校验信息，可下载到本地保存。</p></div><span>{data.executor.history.length} 个恢复点</span></div>
      <div className="backup-actions"><button className="primary" disabled={!data.executor.ready||Boolean(busy)} onClick={createBackup}>{busy==="backup"?"正在备份…":"立即创建备份"}</button><label className={busy==="import"?"disabled":""}>导入备份文件<input type="file" accept=".gz,application/gzip" disabled={!data.executor.ready||Boolean(busy)} onChange={event=>{const file=event.target.files?.[0];if(file)void importBackup(file);event.currentTarget.value=""}}/></label><small>重大修改或更新镜像前，建议先创建并下载备份。</small></div>
      {!data.executor.ready?<div className="update-empty">备份服务尚未就绪，请更新到包含单容器备份服务的最新镜像。</div>:!data.executor.history.length?<div className="update-empty">暂无备份，建议现在创建第一个恢复点。</div>:<div className="update-history-list">{data.executor.history.map(item=><article key={item.id}><span className={`update-history-status ${item.status}`}>{statuses[item.status]||item.status}</span><div><b>{item.id}<em>{kinds[item.kind||""]||"系统备份"}</em></b><small>{new Date(item.createdAt).toLocaleString("zh-CN",{hour12:false})} · {item.database==="mysql"?"MySQL 数据库":"SQLite 数据库"}</small><p>{item.message}{item.checksum?` · 校验 ${item.checksum.slice(0,12)}`:""}</p></div><div className="backup-row-actions"><a href={`/api/admin/update-center?download=${encodeURIComponent(item.id)}`}>下载</a><button disabled={data.executor.running} onClick={()=>rollback(item.id)}>恢复</button><button className="danger" disabled={data.executor.running||["updating","rolling_back"].includes(item.status)} onClick={()=>deleteBackup(item.id)}>删除</button></div></article>)}</div>}
    </section>
  </div>;
}
