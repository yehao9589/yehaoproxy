"use client";

import {useEffect, useMemo, useState} from "react";

type View = "templates" | "email" | "sms";
type Template = {
  id: string;
  name: string;
  scene: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  enabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
};
type Sms = {
  provider: string;
  enabled: boolean;
  signName: string;
  credentialRef: string;
  secretRef: string;
  region: string;
  endpoint: string;
  senderId: string;
};

const emptySms: Sms = {
  provider: "aliyun",
  enabled: false,
  signName: "YehaoProxy",
  credentialRef: "SMS_ACCESS_KEY_ID",
  secretRef: "SMS_ACCESS_KEY_SECRET",
  region: "cn-hangzhou",
  endpoint: "",
  senderId: "",
};

const providerNames: Record<string, string> = {
  resend: "Resend",
  smtp: "自定义 SMTP",
  ses: "Amazon SES",
  aliyun: "阿里云邮件",
  tencent: "腾讯云短信",
  twilio: "Twilio",
  generic: "通用 HTTP",
};

export default function NotificationSettings() {
  const [view, setView] = useState<View>("templates");
  const [email, setEmail] = useState<any>(null);
  const [sms, setSms] = useState<Sms>(emptySms);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<"email" | "sms" | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/notification-settings", {cache: "no-store"});
    const data = await response.json();
    if (response.ok) {
      setEmail(data.email);
      setSms(data.sms || emptySms);
      setTemplates((data.templates || []).map((item: Template) => ({
        ...item,
        enabled: item.enabled !== false,
        emailEnabled: item.emailEnabled !== false,
        smsEnabled: item.smsEnabled === true,
      })));
    } else {
      notify(data.error || "通知配置读取失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3200);
  }

  async function saveEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/email-settings", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({...raw, enabled: raw.enabled === "on"}),
    });
    const data = await response.json();
    notify(response.ok ? "邮件接口已保存" : data.error || "保存失败");
    if (response.ok) {
      setEditingChannel(null);
      void load();
    }
  }

  async function saveSms(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/notification-settings", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({kind: "sms", ...sms}),
    });
    const data = await response.json();
    notify(response.ok ? "短信接口已保存" : data.error || "保存失败");
    if (response.ok) setEditingChannel(null);
  }

  async function persistTemplates(next = templates) {
    const response = await fetch("/api/admin/notification-settings", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({kind: "templates", templates: next}),
    });
    const data = await response.json();
    notify(response.ok ? "通知模板已保存" : data.error || "保存失败");
    if (response.ok) setEditingTemplate(null);
  }

  function updateTemplate(id: string, key: keyof Template, value: string | boolean) {
    setTemplates(rows => rows.map(row => row.id === id ? {...row, [key]: value} : row));
  }

  async function toggleTemplate(id: string) {
    const next = templates.map(row => row.id === id ? {...row, enabled: row.enabled === false} : row);
    setTemplates(next);
    await persistTemplates(next);
  }

  const current = useMemo(
    () => templates.find(item => item.id === editingTemplate) || null,
    [templates, editingTemplate],
  );

  const activeTemplates = templates.filter(item => item.enabled !== false).length;
  const sceneCount = new Set(templates.map(item => item.scene)).size;

  return (
    <div className="notify-admin">
      {message && <div className="settings-toast">{message}</div>}

      <header className="notify-head">
        <div>
          <span className="notify-eyebrow">通知中心</span>
          <h2>通知中心</h2>
          <p>统一管理邮件、短信接口与客户触达模板</p>
        </div>
        <div className="notify-head-actions">
          <button type="button" className="notify-btn secondary" onClick={() => notify("测试任务已提交，正式部署后将调用实际接口")}>发送测试</button>
          {view !== "templates" && (
            <button type="button" className="notify-btn primary" onClick={() => setEditingChannel(view)}>配置接口</button>
          )}
        </div>
      </header>

      <div className="notify-stats">
        <Stat label="启用模板" value={`${activeTemplates}/${templates.length || 0}`} hint={`${sceneCount} 个业务场景`} tone="blue"/>
        <Stat label="邮件通道" value={email?.enabled ? "运行中" : "未启用"} hint={email ? providerNames[email.provider] || email.provider : "尚未配置"} tone={email?.enabled ? "green" : "gray"}/>
        <Stat label="短信通道" value={sms.enabled ? "运行中" : "未启用"} hint={providerNames[sms.provider] || sms.provider} tone={sms.enabled ? "green" : "gray"}/>
      </div>

      <nav className="notify-nav">
        <button className={view === "templates" ? "on" : ""} onClick={() => setView("templates")}>通知模板</button>
        <button className={view === "email" ? "on" : ""} onClick={() => setView("email")}>邮件接口</button>
        <button className={view === "sms" ? "on" : ""} onClick={() => setView("sms")}>短信接口</button>
      </nav>

      {loading ? <div className="notify-loading">正在读取通知配置…</div> : null}

      {!loading && view === "templates" && (
        <section className="notify-panel">
          <div className="notify-panel-head">
            <div><h3>通知模板</h3><p>按业务场景启停通知，并分别维护邮件与短信内容</p></div>
            <div className="notify-filter"><span>共 {templates.length} 个模板</span><button type="button">语言：简体中文</button></div>
          </div>
          <div className="notify-table-wrap">
            <table className="notify-table">
              <thead><tr><th>状态</th><th>模板名称</th><th>业务场景</th><th>邮件标题</th><th>发送渠道</th><th>操作</th></tr></thead>
              <tbody>
                {templates.map(item => (
                  <tr key={item.id}>
                    <td><button aria-label={`${item.name}状态`} className={`notify-switch ${item.enabled === false ? "" : "on"}`} onClick={() => void toggleTemplate(item.id)}><i/></button></td>
                    <td><button className="notify-template-link" onClick={() => setEditingTemplate(item.id)}>{item.name}</button><small>{item.id}</small></td>
                    <td><span className="notify-scene">{item.scene}</span></td>
                    <td className="notify-subject">{item.emailSubject}</td>
                    <td>
                      <div className="notify-channels">
                        {item.emailEnabled !== false && <span className="active">邮件</span>}
                        {item.smsEnabled === true && <span className="active sms">短信</span>}
                        {item.emailEnabled === false && item.smsEnabled !== true && <span className="off">未选择</span>}
                      </div>
                    </td>
                    <td><button className="notify-action" onClick={() => setEditingTemplate(item.id)}>编辑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && view === "email" && (
        <ChannelTable
          title="邮件发送接口"
          description="系统邮件、验证码和服务提醒统一通过主接口发送"
          rows={[{
            name: email ? providerNames[email.provider] || email.provider : "主邮件接口",
            identity: email?.fromEmail || "尚未配置发件邮箱",
            detail: email?.fromName || "YehaoProxy",
            enabled: Boolean(email?.enabled),
          }]}
          onEdit={() => setEditingChannel("email")}
        />
      )}

      {!loading && view === "sms" && (
        <ChannelTable
          title="短信发送接口"
          description="验证码与重要服务提醒可通过短信通道发送"
          rows={[{
            name: providerNames[sms.provider] || sms.provider,
            identity: sms.signName || "尚未配置短信签名",
            detail: sms.region || "未设置区域",
            enabled: sms.enabled,
          }]}
          onEdit={() => setEditingChannel("sms")}
        />
      )}

      {current && (
        <div className="notify-overlay" onMouseDown={event => event.target === event.currentTarget && setEditingTemplate(null)}>
          <section className="notify-drawer">
            <DrawerHead title="编辑通知模板" subtitle={`${current.name} · ${current.scene}`} onClose={() => setEditingTemplate(null)}/>
            <div className="notify-drawer-body">
              <div className="notify-form-grid two">
                <label>模板名称<input value={current.name} onChange={event => updateTemplate(current.id, "name", event.target.value)}/></label>
                <label>业务场景<input value={current.scene} onChange={event => updateTemplate(current.id, "scene", event.target.value)}/></label>
              </div>
              <div className="notify-channel-choice">
                <div><b>发送渠道</b><small>邮件为默认主通道；短信仅在接口已配置并启用时发送</small></div>
                <label className={current.emailEnabled !== false ? "selected" : ""}>
                  <input type="checkbox" checked={current.emailEnabled !== false} onChange={event => updateTemplate(current.id, "emailEnabled", event.target.checked)}/>
                  <span><b>邮件</b><small>默认启用</small></span>
                </label>
                <label className={current.smsEnabled === true ? "selected" : ""}>
                  <input type="checkbox" checked={current.smsEnabled === true} onChange={event => updateTemplate(current.id, "smsEnabled", event.target.checked)}/>
                  <span><b>短信</b><small>{sms.enabled ? "接口已启用" : "接口未启用"}</small></span>
                </label>
              </div>
              <div className="notify-vars"><b>可用变量</b>{["{{code}}", "{{orderId}}", "{{product}}", "{{days}}", "{{expiresAt}}", "{{customerName}}"].map(item => <code key={item}>{item}</code>)}</div>
              <label className="notify-field">邮件标题<input value={current.emailSubject} onChange={event => updateTemplate(current.id, "emailSubject", event.target.value)}/></label>
              <label className="notify-field">邮件正文<textarea rows={8} value={current.emailBody} onChange={event => updateTemplate(current.id, "emailBody", event.target.value)}/></label>
              <label className="notify-field">短信正文 <small>{current.smsBody.length}/500</small><textarea rows={4} maxLength={500} value={current.smsBody} onChange={event => updateTemplate(current.id, "smsBody", event.target.value)}/></label>
              <div className="notify-preview"><b>短信预览</b><p>{preview(current.smsBody)}</p></div>
            </div>
            <footer className="notify-drawer-foot"><button className="notify-btn secondary" onClick={() => setEditingTemplate(null)}>取消</button><button className="notify-btn primary" onClick={() => void persistTemplates()}>保存模板</button></footer>
          </section>
        </div>
      )}

      {editingChannel === "email" && (
        <div className="notify-overlay" onMouseDown={event => event.target === event.currentTarget && setEditingChannel(null)}>
          <form className="notify-drawer" onSubmit={saveEmail}>
            <DrawerHead title="配置邮件接口" subtitle="密钥仅从服务器环境变量读取，不保存明文" onClose={() => setEditingChannel(null)}/>
            <div className="notify-drawer-body">
              <div className="notify-enable-row"><div><b>启用邮件发送</b><small>配置并测试成功后开启</small></div><input name="enabled" type="checkbox" defaultChecked={email?.enabled}/></div>
              <div className="notify-form-grid two">
                <label>服务商<select name="provider" defaultValue={email?.provider || "resend"}><option value="resend">Resend</option><option value="smtp">自定义 SMTP</option><option value="ses">Amazon SES</option><option value="aliyun">阿里云邮件</option></select></label>
                <label>发件人名称<input name="fromName" defaultValue={email?.fromName || "YehaoProxy"} required/></label>
                <label>发件邮箱<input name="fromEmail" type="email" defaultValue={email?.fromEmail || ""} placeholder="noreply@example.com" required/></label>
                <label>账号 / 用户名<input name="username" defaultValue={email?.username || ""}/></label>
                <label>密钥环境变量<input name="credentialRef" defaultValue={email?.credentialRef || "EMAIL_API_KEY"}/></label>
                <label>SMTP 主机<input name="host" defaultValue={email?.host || ""} placeholder="smtp.example.com"/></label>
                <label>SMTP 端口<input name="port" type="number" defaultValue={email?.port || 465}/></label>
                <label>区域<input name="region" defaultValue={email?.region || ""} placeholder="仅 SES / 阿里云使用"/></label>
              </div>
            </div>
            <footer className="notify-drawer-foot"><button type="button" className="notify-btn secondary" onClick={() => setEditingChannel(null)}>取消</button><button className="notify-btn primary">保存接口</button></footer>
          </form>
        </div>
      )}

      {editingChannel === "sms" && (
        <div className="notify-overlay" onMouseDown={event => event.target === event.currentTarget && setEditingChannel(null)}>
          <form className="notify-drawer" onSubmit={saveSms}>
            <DrawerHead title="配置短信接口" subtitle="支持国内云短信、Twilio 与通用 HTTP 网关" onClose={() => setEditingChannel(null)}/>
            <div className="notify-drawer-body">
              <div className="notify-enable-row"><div><b>启用短信发送</b><small>需先完成签名与模板审核</small></div><input type="checkbox" checked={sms.enabled} onChange={event => setSms({...sms, enabled: event.target.checked})}/></div>
              <div className="notify-provider-list">
                {[["aliyun", "阿里云短信"], ["tencent", "腾讯云短信"], ["twilio", "Twilio"], ["generic", "通用 HTTP"]].map(([id, name]) => <button type="button" className={sms.provider === id ? "on" : ""} onClick={() => setSms({...sms, provider: id})} key={id}>{name}</button>)}
              </div>
              <div className="notify-form-grid two">
                <label>短信签名<input value={sms.signName} onChange={event => setSms({...sms, signName: event.target.value})}/></label>
                <label>区域<input value={sms.region} onChange={event => setSms({...sms, region: event.target.value})}/></label>
                <label>Access Key 环境变量<input value={sms.credentialRef} onChange={event => setSms({...sms, credentialRef: event.target.value})}/></label>
                <label>Secret 环境变量<input value={sms.secretRef} onChange={event => setSms({...sms, secretRef: event.target.value})}/></label>
                <label>发送方标识<input value={sms.senderId} onChange={event => setSms({...sms, senderId: event.target.value})}/></label>
                <label>接口地址<input value={sms.endpoint} onChange={event => setSms({...sms, endpoint: event.target.value})}/></label>
              </div>
            </div>
            <footer className="notify-drawer-foot"><button type="button" className="notify-btn secondary" onClick={() => setEditingChannel(null)}>取消</button><button className="notify-btn primary">保存接口</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({label, value, hint, tone}: {label: string; value: string; hint: string; tone: string}) {
  return <div className="notify-stat"><span className={`notify-dot ${tone}`}/><div><small>{label}</small><b>{value}</b><p>{hint}</p></div></div>;
}

function ChannelTable({title, description, rows, onEdit}: {title: string; description: string; rows: Array<{name: string; identity: string; detail: string; enabled: boolean}>; onEdit: () => void}) {
  return <section className="notify-panel"><div className="notify-panel-head"><div><h3>{title}</h3><p>{description}</p></div><button className="notify-btn primary" onClick={onEdit}>配置接口</button></div><div className="notify-table-wrap"><table className="notify-table channel"><thead><tr><th>接口名称</th><th>发送身份</th><th>补充信息</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td><b>{row.name}</b><small>主发送通道</small></td><td>{row.identity}</td><td>{row.detail}</td><td><span className={`notify-status ${row.enabled ? "enabled" : ""}`}>{row.enabled ? "已启用" : "已关闭"}</span></td><td><button className="notify-action" onClick={onEdit}>编辑</button></td></tr>)}</tbody></table></div></section>;
}

function DrawerHead({title, subtitle, onClose}: {title: string; subtitle: string; onClose: () => void}) {
  return <header className="notify-drawer-head"><div><h3>{title}</h3><p>{subtitle}</p></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>;
}

function preview(text: string) {
  return text
    .replaceAll("{{code}}", "628193")
    .replaceAll("{{orderId}}", "YH-A82D19")
    .replaceAll("{{product}}", "静态住宅 IP")
    .replaceAll("{{days}}", "3")
    .replaceAll("{{expiresAt}}", "2026-08-01 12:00")
    .replaceAll("{{customerName}}", "客户");
}
