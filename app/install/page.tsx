"use client";

import { useEffect, useState } from "react";

type Status = {
  installed: boolean;
  database: boolean;
  databaseBinding: boolean;
  runtime: "mysql" | "sqlite";
  mysqlSupported: boolean;
};

type DatabaseType = "mysql" | "sqlite";
type DatabaseMode = "new" | "existing";

export default function InstallPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(1);
  const [databaseType, setDatabaseType] = useState<DatabaseType>("mysql");
  const [mode, setMode] = useState<DatabaseMode>("new");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [done, setDone] = useState(false);
  const [mysqlConfig, setMysqlConfig] = useState({
    mysqlHost: "127.0.0.1",
    mysqlPort: "3306",
    mysqlDatabase: "yehaoproxy",
    mysqlUser: "yehaoproxy",
    mysqlPassword: "",
    mysqlSsl: false,
  });

  useEffect(() => {
    void fetch("/api/install", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: Status) => {
        setStatus(value);
        if (!value.installed && value.runtime === "sqlite") setDatabaseType("sqlite");
      });
  }, []);

  function updateMysql(field: keyof typeof mysqlConfig, value: string | boolean) {
    setMysqlConfig((current) => ({ ...current, [field]: value }));
  }

  async function testMysql() {
    setTesting(true);
    setMessage("");
    setSuccess("");
    try {
      const response = await fetch("/api/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test-mysql", ...mysqlConfig }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "连接失败");
      setSuccess(`MySQL 连接正常，服务端版本：${body.version || "已识别"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "MySQL 连接失败");
    } finally {
      setTesting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status?.installed) {
      setMessage("当前为预览模式，不会修改现有数据库和管理员账户。");
      return;
    }
    setBusy(true);
    setMessage("");
    setSuccess("");
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...raw,
          ...mysqlConfig,
          databaseType,
          databaseMode: mode,
          registrationEnabled: raw.registrationEnabled === "on",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "安装失败");
      setDone(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "安装失败");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <main className="installer-shell"><div className="installer-loading">正在检测部署环境…</div></main>;
  }
  if (done) {
    return <main className="installer-shell"><section className="installer-complete"><i>✓</i><h1>部署配置完成</h1><p>数据库、超级管理员和站点基础信息已经初始化。</p><a href="/login">使用管理员账户登录</a></section></main>;
  }
  if (status.installed) {
    return (
      <main className="installer-shell">
        <section className="installer-complete">
          <i>✓</i>
          <h1>系统已完成安装</h1>
          <p>为保护数据库与管理员账户，首次部署入口已经锁定。</p>
          <a href="/login">前往登录</a>
        </section>
      </main>
    );
  }

  return (
    <main className="installer-shell">
      <div className="installer-layout">
        <aside>
          <div className="installer-brand"><b>Y</b><span>YehaoProxy<small>首次部署向导</small></span></div>
          <ol>
            <li className={step === 1 ? "on" : step > 1 ? "done" : ""}><i>{step > 1 ? "✓" : "1"}</i><span>环境检测<small>确认运行环境与数据库驱动</small></span></li>
            <li className={step === 2 ? "on" : step > 2 ? "done" : ""}><i>{step > 2 ? "✓" : "2"}</i><span>数据库配置<small>选择 MySQL 或 SQLite</small></span></li>
            <li className={step === 3 ? "on" : ""}><i>3</i><span>管理员与站点<small>建立超级管理员账户</small></span></li>
          </ol>
          <footer>安装完成后入口将自动锁定</footer>
        </aside>

        <section className="installer-panel">
          <header>
            <span>STEP {step} OF 3</span>
            <h1>{step === 1 ? "检查部署环境" : step === 2 ? "选择数据库建立方式" : "完成系统初始化"}</h1>
            <p>{step === 1 ? "同一套系统可使用 MySQL 或 SQLite，业务功能保持一致。" : step === 2 ? "正式环境推荐 MySQL；SQLite 适合轻量部署与本地快速运行。" : "确认数据库并创建超级管理员。"}</p>
          </header>
          {message && <div className="installer-error">{message}</div>}
          {success && <div className="installer-success">{success}</div>}

          {step === 1 && (
            <div className="installer-body">
              <div className="installer-checks">
                <article><i className="ok">✓</i><span><b>双数据库运行层</b><small>MySQL 8 与 SQLite / D1 均已集成</small></span><em>正常</em></article>
                <article><i className={status.databaseBinding ? "ok" : "bad"}>{status.databaseBinding ? "✓" : "!"}</i><span><b>当前数据库</b><small>{status.databaseBinding ? `已连接 ${status.runtime === "mysql" ? "MySQL" : "SQLite / D1"}` : "等待在下一步配置"}</small></span><em>{status.databaseBinding ? "正常" : "待配置"}</em></article>
                <article><i className="ok">✓</i><span><b>部署建议</b><small>开发与正式部署使用 MySQL，SQLite 保留为可选模式</small></span><em>推荐</em></article>
              </div>
              <footer><button className="primary" onClick={() => setStep(2)}>下一步：配置数据库</button></footer>
            </div>
          )}

          {step === 2 && (
            <div className="installer-body">
              <section className="installer-config-section">
                <div className="installer-section-title"><i>1</i><span><b>数据库引擎</b><small>选择系统实际存储业务数据的位置</small></span></div>
                <div className="installer-engine-options">
                  <button className={databaseType === "mysql" ? "on" : ""} onClick={() => {setDatabaseType("mysql");setSuccess("");setMessage("")}}><i>MY</i><span><b>MySQL 8</b><small>开发、Docker 与正式部署推荐</small><em>推荐</em></span>{databaseType === "mysql" && <strong>✓</strong>}</button>
                  <button className={databaseType === "sqlite" ? "on" : ""} onClick={() => {setDatabaseType("sqlite");setSuccess("");setMessage("")}}><i>SQ</i><span><b>SQLite / D1</b><small>适合单机轻量部署或 Cloudflare</small></span>{databaseType === "sqlite" && <strong>✓</strong>}</button>
                </div>
              </section>
              <section className="installer-config-section">
                <div className="installer-section-title"><i>2</i><span><b>初始化方式</b><small>新部署请选择创建全新数据库</small></span></div>
                <div className="installer-db-options compact">
                  <button className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}><i>＋</i><span><b>创建全新数据库</b><small>自动创建全部业务数据表</small></span>{mode === "new" && <strong>✓</strong>}</button>
                  <button className={mode === "existing" ? "on" : ""} onClick={() => setMode("existing")}><i>↗</i><span><b>接入已有数据库</b><small>验证并使用现有数据结构</small></span>{mode === "existing" && <strong>✓</strong>}</button>
                </div>
              </section>
              <section className="installer-config-section connection">
                <div className="installer-section-title"><i>3</i><span><b>{databaseType === "mysql" ? "MySQL 连接信息" : "SQLite 运行方式"}</b><small>{databaseType === "mysql" ? "信息只用于连接数据库，不会展示在前台" : "无需填写服务器地址和账号"}</small></span></div>
                {databaseType === "mysql" ? (
                  <div className="installer-mysql-form">
                    <label>数据库地址<input value={mysqlConfig.mysqlHost} onChange={(event) => updateMysql("mysqlHost", event.target.value)} placeholder="宝塔单容器填写 127.0.0.1" /></label>
                    <label>端口<input value={mysqlConfig.mysqlPort} onChange={(event) => updateMysql("mysqlPort", event.target.value)} inputMode="numeric" /></label>
                    <label>数据库名<input value={mysqlConfig.mysqlDatabase} onChange={(event) => updateMysql("mysqlDatabase", event.target.value)} /></label>
                    <label>用户名<input value={mysqlConfig.mysqlUser} onChange={(event) => updateMysql("mysqlUser", event.target.value)} /></label>
                    <label className="wide">数据库密码<input type="password" value={mysqlConfig.mysqlPassword} onChange={(event) => updateMysql("mysqlPassword", event.target.value)} placeholder="请输入数据库密码" /></label>
                    <label className="wide installer-checkbox"><input type="checkbox" checked={mysqlConfig.mysqlSsl} onChange={(event) => updateMysql("mysqlSsl", event.target.checked)} /><span><b>使用 SSL 加密连接</b><small>远程或云数据库建议开启</small></span></label>
                    <button className="mysql-test" type="button" disabled={testing} onClick={() => void testMysql()}>{testing ? "正在测试连接…" : "测试连接"}</button>
                  </div>
                ) : (
                  <div className="installer-note sqlite-note"><b>无需额外配置</b><span>本地自动使用持久化 SQLite；Cloudflare 部署时可绑定 D1。</span></div>
                )}
              </section>
              <footer><button onClick={() => setStep(1)}>上一步</button><button className="primary" onClick={() => setStep(3)}>下一步：创建管理员</button></footer>
            </div>
          )}

          {step === 3 && (
            <form className="installer-body" onSubmit={submit}>
              <div className="installer-selection"><span>数据库</span><b>{databaseType === "mysql" ? `MySQL · ${mysqlConfig.mysqlHost}:${mysqlConfig.mysqlPort}/${mysqlConfig.mysqlDatabase}` : "SQLite / D1"}</b><em>{mode === "new" ? "新建" : "已有"}</em></div>
              <div className="installer-form">
                <label>站点名称<input name="siteName" required defaultValue="YehaoProxy" /></label>
                <label>管理员名称<input name="name" required defaultValue="超级管理员" /></label>
                <label className="wide">管理员邮箱<input name="email" required type="email" placeholder="admin@example.com" /><small>以后使用此邮箱登录管理后台</small></label>
                <label>管理员密码<input name="password" required type="password" minLength={10} placeholder="至少 10 位，包含字母和数字" /></label>
                <label>确认密码<input name="confirmPassword" required type="password" minLength={10} /></label>
                <label className="wide installer-checkbox"><input name="registrationEnabled" type="checkbox" defaultChecked /><span><b>允许客户注册</b><small>安装后仍可在安全策略中修改</small></span></label>
              </div>
              <footer><button type="button" onClick={() => setStep(2)}>上一步</button><button className="primary" disabled={busy}>{busy ? "正在初始化…" : "完成安装"}</button></footer>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
