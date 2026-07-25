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
    if (value) setMessage(value.message);
  }

  if (!data) return <div className="setting-card">{message || "正在加载更新中心…"}</div>;
  return <div className="update-center">
    {message && <div className="settings-toast">{message}</div>}
    <section className="update-hero">
      <div><span>当前版本</span><b>{data.runtime.currentVersion}</b><small>{data.runtime.commit ? `提交 ${data.runtime.commit}` : "开发版本"}</small></div>
      <div><span>部署方式</span><b>{data.settings.deploymentMode === "docker" ? "Docker 镜像" : "手动部署"}</b><small>{data.runtime.image || data.settings.image || "尚未设置镜像"}</small></div>
      <div><span>远程触发</span><b className={data.runtime.updateWebhookReady ? "ready" : "waiting"}>{data.runtime.updateWebhookReady ? "已就绪" : "待配置"}</b><small>由容器编排执行拉取与重建</small></div>
      <button onClick={check} disabled={Boolean(busy)}>{busy === "check" ? "检查中…" : "检查更新"}</button>
    </section>

    {result && <section className={`update-release ${result.hasUpdate ? "new" : ""}`}>
      <div><span>{result.hasUpdate ? "发现可用更新" : "已是最新版本"}</span><h2>{result.remoteVersion}</h2><small>{result.publishedAt || "未提供发布时间"}</small></div>
      <p>{result.releaseNotes || "该版本暂未提供更新说明。"}</p>
      <button className="primary" disabled={!result.hasUpdate || !data.runtime.updateWebhookReady || Boolean(busy)} onClick={trigger}>
        {busy === "trigger" ? "正在提交…" : "提交容器更新任务"}
      </button>
    </section>}

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
