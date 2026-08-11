"use client";

import { useEffect, useState } from "react";

type Data = {
  settings: {
    deploymentMode: "docker" | "manual";
    repository: string;
    branch: string;
    image: string;
    channel: "stable" | "beta";
    manifestUrl: string;
    autoCheck: boolean;
  };
  runtime: {
    currentVersion: string;
    image: string;
    imageTag: string;
    commit: string;
    deployment: string;
    updateWebhookReady: boolean;
    checkedAt: string;
  };
  executor: {
    ready: boolean;
    running: boolean;
    backupDirectory?: string;
    history: Array<{id:string;kind?:string;status:string;createdAt:string;updatedAt:string;image:string;message:string;fileName?:string;checksum?:string;database?:string}>;
  };
};
type CheckResult = {
  currentVersion: string;
  remoteVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  image: string;
  publishedAt: string;
};

export default function UpdateCenter() {
  const [data, setData] = useState<Data | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch("/api/admin/update-center", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setData(body);
    else setMessage(body.error || "更新中心加载失败");
  }
  useEffect(() => { void load(); }, []);

  async function call(body: Record<string, unknown>) {
    setBusy(String(body.action));
    setMessage("");
    const response = await fetch("/api/admin/update-center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    setBusy("");
    if (!response.ok) {
      setMessage(value.error || "操作失败");
      return null;
    }
    return value;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const value = await call({ action: "save", ...raw, autoCheck: raw.autoCheck === "on" });
    if (value) {
      setData(current => current ? { ...current, settings: value.settings } : current);
      setMessage("在线更新设置已保存");
    }
  }
  async function check() {
    const value = await call({ action: "check" });
    if (value) {
      setResult(value);
      setMessage(value.hasUpdate ? `发现新版本 ${value.remoteVersion}` : "当前已经是最新版本");
    }
  }
  async function trigger() {
    if (!confirm("确定把更新任务提交给容器编排服务吗？更新期间服务可能短暂重启。")) return;
    const value = await call({ action: "trigger" });
    if (value) { setMessage("更新任务已提交，系统正在执行备份与健康检查"); window.setTimeout(()=>void load(),1500); }
  }
  async function rollback(backupId:string) {
    if (!confirm(`确定恢复备份 ${backupId} 吗？恢复前会先备份当前系统，随后替换数据库、上传文件与配置。`)) return;
    const value=await call({action:"rollback",backupId});
    if(value){setMessage(value.message||"回滚任务已提交");window.setTimeout(()=>void load(),1500)}
  }
  async function createBackup(){
    if(!confirm("确定立即创建完整系统备份吗？"))return;
    const value=await call({action:"backup"});if(value){setMessage("系统备份已创建，可以下载到本地保存");await load()}
  }
  async function importBackup(file:File){
    if(!file.name.toLowerCase().endsWith(".tar.gz")){setMessage("请选择 .tar.gz 系统备份文件");return}
    setBusy("import");setMessage("");
    const response=await fetch("/api/admin/update-center",{method:"POST",headers:{"content-type":"application/gzip","x-backup-filename":file.name},body:file});const value=await response.json();setBusy("");
    if(!response.ok){setMessage(value.error||"导入失败");return}setMessage("备份文件已导入，请核对后点击恢复");await load();
  }
  const statusName:Record<string,string>={backed_up:"可恢复",updating:"正在更新",completed:"更新成功",rolling_back:"正在恢复",rolled_back:"已回滚",rollback_failed:"回滚失败",restored:"恢复成功",restore_failed:"恢复失败"};
  const kindName:Record<string,string>={manual:"手动备份",update:"更新前备份",safety:"恢复前保护点",imported:"导入备份"};

  if (!data) return <div className="setting-card">{message || "正在加载更新中心…"}</div>;
  return <div className="update-center">
    {message && <div className="settings-toast">{message}</div>}
    <section className="update-hero">
      <div><span>当前版本</span><b>{data.runtime.currentVersion}</b><small>{data.runtime.commit ? `提交 ${data.runtime.commit}` : "开发版本"}</small></div>
      <div><span>部署方式</span><b>{data.settings.deploymentMode === "docker" ? "Docker 镜像" : "手动部署"}</b><small>{data.runtime.image || data.settings.image || "尚未设置镜像"}</small></div>
      <div><span>安全更新执行器</span><b className={data.executor.ready ? "ready" : "waiting"}>{data.executor.ready ? (data.executor.running?"任务执行中":"已就绪") : "待配置"}</b><small>备份、健康检查与自动回滚</small></div>
      <button onClick={check} disabled={Boolean(busy)}>{busy === "check" ? "检查中…" : "检查更新"}</button>
    </section>

    {result && <section className={`update-release ${result.hasUpdate ? "new" : ""}`}>
      <div><span>{result.hasUpdate ? "发现可用更新" : "已是最新版本"}</span><h2>{result.remoteVersion}</h2><small>{result.publishedAt || "未提供发布时间"}</small></div>
      <p>{result.releaseNotes || "该版本暂未提供更新说明。"}</p>
      <button className="primary" disabled={!result.hasUpdate || !data.runtime.updateWebhookReady || Boolean(busy)} onClick={trigger}>
        {busy === "trigger" ? "正在提交…" : "提交容器更新任务"}
      </button>
    </section>}

    <section className="setting-card update-history system-backup-card">
      <div className="setting-title"><div><h2>系统备份与灾难恢复</h2><p>完整备份数据库、上传文件和关键配置，可下载到其他设备保存，重装系统后也能导入恢复。</p></div><span>{data.executor.history.length} 个恢复点</span></div>
      <div className="backup-actions"><button className="primary" disabled={!data.executor.ready||Boolean(busy)} onClick={createBackup}>{busy==="backup"?"正在备份…":"立即创建备份"}</button><label className={busy==="import"?"disabled":""}>导入备份文件<input type="file" accept=".gz,application/gzip" disabled={!data.executor.ready||Boolean(busy)} onChange={event=>{const file=event.target.files?.[0];if(file)void importBackup(file);event.currentTarget.value=""}} /></label><small>建议每次重大修改前备份，并把文件下载到本地或对象存储。</small></div>
      {!data.executor.ready?<div className="update-empty">备份执行器尚未连接，部署后才能创建和恢复系统备份。</div>:!data.executor.history.length?<div className="update-empty">还没有系统备份，建议现在创建第一个恢复点。</div>:null}
      {data.executor.ready&&Boolean(data.executor.history.length)&&<div className="update-history-list">{data.executor.history.map(item=><article key={`backup-${item.id}`}><span className={`update-history-status ${item.status}`}>{statusName[item.status]||item.status}</span><div><b>{item.id}<em>{kindName[item.kind||""]||"系统备份"}</em></b><small>{new Date(item.createdAt).toLocaleString("zh-CN",{hour12:false})} · {item.database==="mysql"?"MySQL 数据库":"SQLite 数据库"}</small><p>{item.message}{item.checksum?` · 校验 ${item.checksum.slice(0,12)}`:""}</p></div><div className="backup-row-actions"><a href={`/api/admin/update-center?download=${encodeURIComponent(item.id)}`}>下载</a><button disabled={data.executor.running||["updating","rolling_back"].includes(item.status)} onClick={()=>rollback(item.id)}>恢复</button></div></article>)}</div>}
    </section>

    <form className="setting-card" onSubmit={save}>
      <div className="setting-title"><div><h2>更新源与镜像</h2><p>后台负责检测版本，Docker/宝塔容器编排负责真正更新。</p></div><span>仅超级管理员</span></div>
      <div className="setting-grid">
        <label>部署模式<select name="deploymentMode" defaultValue={data.settings.deploymentMode}><option value="docker">Docker 镜像</option><option value="manual">手动部署</option></select></label>
        <label>更新渠道<select name="channel" defaultValue={data.settings.channel}><option value="stable">正式版</option><option value="beta">测试版</option></select></label>
        <label className="wide">Gitee 仓库<input name="repository" defaultValue={data.settings.repository} /></label>
        <label>跟踪分支<input name="branch" defaultValue={data.settings.branch} /></label>
        <label>Docker 镜像<input name="image" defaultValue={data.settings.image} placeholder="registry.example.com/yehaoproxy:latest" /></label>
        <label className="wide">版本清单地址<input name="manifestUrl" defaultValue={data.settings.manifestUrl} placeholder="https://.../update.json" /><small>清单应包含 version、releaseNotes、image、publishedAt 字段。</small></label>
      </div>
      <div className="setting-switch"><div><b>自动检查更新</b><small>只检测并提醒，不会自动重启容器。</small></div><input name="autoCheck" type="checkbox" defaultChecked={data.settings.autoCheck} /></div>
      <footer><button className="primary" disabled={Boolean(busy)}>{busy === "save" ? "保存中…" : "保存更新设置"}</button></footer>
    </form>

    <section className="setting-card update-guide">
      <div className="setting-title"><div><h2>Docker 部署说明</h2><p>生产环境建议由容器编排平台负责替换镜像和健康检查。</p></div></div>
      <ol><li>构建新镜像并推送到镜像仓库。</li><li>同步发布 Gitee 版本清单。</li><li>后台检查到新版本后提交更新任务。</li><li>编排平台执行拉取镜像、重建容器和健康检查。</li><li>异常时由编排平台恢复上一镜像标签。</li></ol>
      <pre>docker compose pull{"\n"}docker compose up -d --remove-orphans</pre>
      <small>远程触发需在服务器环境变量中配置 UPDATE_WEBHOOK_URL；私有 Gitee 清单令牌使用 GITEE_ACCESS_TOKEN。</small>
    </section>
  </div>;
}
