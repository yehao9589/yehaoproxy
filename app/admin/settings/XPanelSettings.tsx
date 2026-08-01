"use client";
import { useEffect, useMemo, useState } from "react";
import "./vps-management.css";
import "./vps-inbounds.css";
import "./vps-editor-modal.css";
import "./vps-calibrate.css";
type Inbound = { id:string; name:string; protocol:string; port:number; up:number; down:number; used:number; clientCount:number; enabled:boolean };
type Metrics = {
  used: number;
  rawUsed: number;
  total: number;
  remaining: number;
  inboundCount: number;
  enabledInboundCount: number;
  clientCount: number;
  protocols: string[];
  inbounds?: Inbound[];
  syncedAt: string;
};
type Server = {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  enabled: boolean;
  totalGb: number;
  passwordConfigured: boolean;
  syncIntervalMinutes: number;
  resetCycle: "monthly" | "order-expiry" | "never";
  boundOrderId?: string;
  boundOrderExpiry?: string;
  resetDay: number;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
  lastMetrics?: Metrics;
};
const size = (n = 0) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(2)} GB`
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${(n / 1024).toFixed(1)} KB`;
const time = (v?: string) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "尚未同步";
export default function XPanelSettings() {
  const [servers, setServers] = useState<Server[]>([]),
    [editing, setEditing] = useState<Server | null | undefined>(undefined),
    [calibrating, setCalibrating] = useState<Server | null>(null),
    [expanded, setExpanded] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function load() {
    const r = await fetch("/api/admin/xpanel"),
      d = await r.json();
    if (r.ok) setServers(d.servers || []);
    else setError(d.error || "加载失败");
  }
  useEffect(() => {
    void load();
  }, []);
  async function post(body: any, success: string) {
    setBusy(body.serverId || body.action);
    setError("");
    const r = await fetch("/api/admin/xpanel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    setBusy("");
    if (r.ok) {
      setMessage(success);
      await load();
    } else setError(d.error || "操作失败");
    return r.ok;
  }
  const totals = useMemo(
    () =>
      servers.reduce(
        (a, x) => ({
          used: a.used + (x.lastMetrics?.used || 0),
          total: a.total + (x.lastMetrics?.total || 0),
          nodes: a.nodes + (x.lastMetrics?.inboundCount || 0),
          clients: a.clients + (x.lastMetrics?.clientCount || 0),
        }),
        { used: 0, total: 0, nodes: 0, clients: 0 },
      ),
    [servers],
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      b = Object.fromEntries(new FormData(f));
    if (
      await post(
        {
          ...b,
          id: editing?.id,
          action: "save-server",
          enabled: b.enabled === "on",
        },
        "VPS 配置已保存",
      )
    ) {
      setEditing(undefined);
      f.reset();
    }
  }
  return (
    <div className="vps-page">
      {message && (
        <div
          className="vps-toast"
          onAnimationEnd={() => setTimeout(() => setMessage(""), 1800)}
        >
          {message}
        </div>
      )}
      {error && (
        <div className="vps-alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      <div className="vps-toolbar">
        <div>
          <h2>VPS 管理</h2>
          <p>统一管理 X-Panel 服务器、同步周期与流量统计周期。</p>
        </div>
        <div>
          <button
            disabled={!!busy || !servers.length}
            onClick={() =>
              void post({ action: "sync-all" }, "全部 VPS 同步完成")
            }
          >
            ↻ 同步全部
          </button>
          <button className="primary" onClick={() => setEditing(null)}>
            ＋ 添加 VPS
          </button>
        </div>
      </div>
      <div className="vps-summary">
        <article>
          <span>服务器</span>
          <b>
            {servers.filter((x) => x.enabled).length}
            <small> / {servers.length} 台在线</small>
          </b>
        </article>
        <article>
          <span>本周期流量</span>
          <b>
            {size(totals.used)}
            <small>
              {totals.total ? ` / ${size(totals.total)}` : " 不限量"}
            </small>
          </b>
        </article>
        <article>
          <span>入站节点</span>
          <b>
            {totals.nodes}
            <small> 个</small>
          </b>
        </article>
        <article>
          <span>面板用户</span>
          <b>
            {totals.clients}
            <small> 个</small>
          </b>
        </article>
      </div>
      {servers.length ? (
        <div className="vps-grid">
          {servers.map((x) => {
            const m = x.lastMetrics,
              p = m?.total ? Math.min(100, (m.used / m.total) * 100) : 0;
            return (
              <article className="vps-card" key={x.id}>
                <header>
                  <div className={`vps-icon ${x.lastSyncStatus || "idle"}`}>
                    VPS
                  </div>
                  <div>
                    <h3>{x.name}</h3>
                    <p>{x.baseUrl.replace(/^https?:\/\//, "")}</p>
                  </div>
                  <span className={x.enabled ? "on" : "off"}>
                    {x.enabled ? "同步开启" : "已停用"}
                  </span>
                </header>
                <div className="vps-traffic">
                  <div>
                    <span>本周期已用</span>
                    <b>{m ? size(m.used) : "--"}</b>
                    <small>
                      {m?.total ? `剩余 ${size(m.remaining)}` : "未限制总流量"}
                    </small>
                  </div>
                  <em>
                    <i style={{ width: `${p}%` }} />
                  </em>
                </div>
                <div className="vps-data">
                  <button type="button" className="vps-data-link" onClick={() => setExpanded(expanded === x.id ? "" : x.id)}>
                    <span>入站节点</span>
                    <b>
                      {m
                        ? `${m.enabledInboundCount} / ${m.inboundCount}`
                        : "--"}
                    </b>
                  </button>
                  <div>
                    <span>用户数量</span>
                    <b>{m?.clientCount ?? "--"}</b>
                  </div>
                  <div>
                    <span>协议</span>
                    <b>{m?.protocols?.join(" · ") || "--"}</b>
                  </div>
                  <div>
                    <span>同步间隔</span>
                    <b>{x.syncIntervalMinutes} 分钟</b>
                  </div>
                  <div>
                    <span>重置周期</span>
                    <b>
                      {x.resetCycle === "monthly"
                        ? `每月 ${x.resetDay} 日`
                        : x.resetCycle === "order-expiry"
                          ? x.boundOrderExpiry ? `订单到期 ${new Date(x.boundOrderExpiry).toLocaleDateString("zh-CN")}` : "跟随订单到期"
                          : "不自动重置"}
                    </b>
                  </div>
                  <div>
                    <span>最后同步</span>
                    <b className={x.lastSyncStatus === "error" ? "bad" : ""}>
                      {x.lastSyncStatus === "error"
                        ? x.lastSyncError
                        : time(x.lastSyncAt)}
                    </b>
                  </div>
                </div>
                {expanded === x.id && <div className="vps-inbounds"><div className="vps-inbounds-head"><b>入站节点流量明细</b><span>同步于 {time(m?.syncedAt)}</span></div>{m?.inbounds?.length?<div className="vps-inbound-table"><header><span>节点</span><span>协议 / 端口</span><span>上传</span><span>下载</span><span>总流量</span><span>用户 / 状态</span></header>{m.inbounds.map(node=><div key={node.id}><b title={node.name}>{node.name}</b><span>{node.protocol} / {node.port||"--"}</span><span>{size(node.up)}</span><span>{size(node.down)}</span><strong>{size(node.used)}</strong><span><i className={node.enabled?"on":"off"}/>{node.clientCount} 人 · {node.enabled?"已启用":"已停用"}</span></div>)}</div>:<div className="vps-inbounds-empty">暂无入站明细，请先点击“立即同步”。</div>}</div>}
                <footer>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void post(
                        { action: "sync-server", serverId: x.id },
                        `${x.name} 数据已同步`,
                      )
                    }
                  >
                    立即同步
                  </button>
                  <button onClick={() => setEditing(x)}>编辑配置</button>
                  <button disabled={!m || !!busy} onClick={() => setCalibrating(x)}>校准流量</button>
                  <button
                    disabled={!m || !!busy}
                    onClick={() =>
                      confirm("确认从当前流量重新开始本统计周期？") &&
                      void post(
                        { action: "reset-cycle", serverId: x.id },
                        "统计周期已重置",
                      )
                    }
                  >
                    重置周期
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      confirm(`确认删除 ${x.name}？`) &&
                      void post(
                        { action: "delete-server", serverId: x.id },
                        "VPS 已删除",
                      )
                    }
                  >
                    删除
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="vps-empty">
          <b>还没有 VPS</b>
          <p>添加 X-Panel 服务器后，这里会展示真实同步数据。</p>
          <button className="primary" onClick={() => setEditing(null)}>
            添加第一台 VPS
          </button>
        </div>
      )}
      {editing !== undefined && (
        <div className="vps-editor-mask" onMouseDown={() => setEditing(undefined)}>
        <form className="vps-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
          <div className="vps-editor-head">
            <div>
              <h3>{editing ? `编辑 ${editing.name}` : "添加 VPS"}</h3>
              <p>保存后可立即同步并验证配置。</p>
            </div>
            <button type="button" onClick={() => setEditing(undefined)}>
              ×
            </button>
          </div>
          <div className="vps-form">
            <label>
              VPS 名称
              <input
                name="name"
                defaultValue={editing?.name || ""}
                placeholder="例如：香港 VPS 01"
                required
              />
            </label>
            <label>
              套餐总流量（GB）
              <input
                name="totalGb"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.totalGb || ""}
                placeholder="0 表示不限量"
              />
            </label>
            <label className="wide">
              X-Panel 地址
              <input
                name="baseUrl"
                type="url"
                defaultValue={editing?.baseUrl || ""}
                placeholder="https://域名:端口/访问路径"
                required
              />
            </label>
            <label>
              管理员用户名
              <input
                name="username"
                defaultValue={editing?.username || ""}
                required
              />
            </label>
            <label>
              管理员密码
              <input
                name="password"
                type="password"
                placeholder={
                  editing?.passwordConfigured
                    ? "留空保持原密码"
                    : "请输入面板密码"
                }
              />
            </label>
            <label>
              同步间隔
              <select
                name="syncIntervalMinutes"
                defaultValue={editing?.syncIntervalMinutes || 10}
              >
                <option value="5">每 5 分钟</option>
                <option value="10">每 10 分钟</option>
                <option value="15">每 15 分钟</option>
                <option value="30">每 30 分钟</option>
                <option value="60">每 1 小时</option>
              </select>
            </label>
            <label>
              流量重置周期
              <select
                name="resetCycle"
                defaultValue={editing?.resetCycle || "monthly"}
              >
                <option value="monthly">每月固定日期</option>
                <option value="order-expiry">跟随绑定订单到期时间</option>
                <option value="never">不自动重置</option>
              </select>
            </label>
            <label>
              每月重置日
              <input
                name="resetDay"
                type="number"
                min="1"
                max="28"
                defaultValue={editing?.resetDay || 1}
              />
            </label>
          </div>
          <label className="vps-enable">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={editing?.enabled ?? true}
            />
            <span>
              <b>启用自动同步</b>
              <small>定时任务将按上方间隔获取真实面板数据</small>
            </span>
          </label>
          <footer>
            <button type="button" onClick={() => setEditing(undefined)}>
              取消
            </button>
            <button className="primary" disabled={!!busy}>
              保存配置
            </button>
          </footer>
        </form>
        </div>
      )}
      {calibrating && (
        <div className="vps-editor-mask" onMouseDown={() => setCalibrating(null)}>
          <form className="vps-editor vps-calibrate" onMouseDown={(event) => event.stopPropagation()} onSubmit={async(event)=>{event.preventDefault();const value=Number(new FormData(event.currentTarget).get("targetGb"));if(await post({action:"calibrate",serverId:calibrating.id,targetGb:value},"流量校准成功"))setCalibrating(null)}}>
            <div className="vps-editor-head"><div><h3>校准 {calibrating.name} 流量</h3><p>填写平台当前应显示的已用流量，后续同步将在此基础上继续累计。</p></div><button type="button" onClick={()=>setCalibrating(null)}>×</button></div>
            <div className="vps-calibrate-current"><span>X-Panel 原始累计</span><b>{size(calibrating.lastMetrics?.rawUsed||0)}</b><span>本站当前显示</span><b>{size(calibrating.lastMetrics?.used||0)}</b></div>
            <label className="vps-calibrate-input">校准后的已用流量（GB）<input name="targetGb" type="number" min="0" step="0.001" defaultValue={((calibrating.lastMetrics?.used||0)/1073741824).toFixed(3)} required/><small>校准只调整本站统计基线，不会修改 X-Panel 中的数据。</small></label>
            <footer><button type="button" onClick={()=>setCalibrating(null)}>取消</button><button className="primary" disabled={!!busy}>确认校准</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
