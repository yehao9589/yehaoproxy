"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";

type Hint = {kind: "success" | "error"; message: string};

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const requestPending = useRef(false);

  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  async function sendCode() {
    if (seconds > 0 || requestPending.current) return;
    requestPending.current = true;
    setSendingCode(true);
    setHint(null);
    try {
      const response = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({email, purpose: "register"}),
      });
      const data = await response.json();
      if (!response.ok) {
        setHint({kind: "error", message: typeof data?.error === "string" ? data.error : "验证码发送失败"});
        return;
      }
      setSeconds(60);
      setHint({kind: "success", message: "验证码已发送，请检查邮箱"});
    } catch {
      setHint({kind: "error", message: "暂时无法发送验证码，请稍后重试。"});
    } finally {
      requestPending.current = false;
      setSendingCode(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setLoading(true);
    setHint(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({name, email, password, code}),
      });
      const data = await response.json();
      if (!response.ok) {
        setHint({kind: "error", message: typeof data?.error === "string" ? data.error : "注册失败"});
        return;
      }
      location.href = "/dashboard";
    } catch {
      setHint({kind: "error", message: "未能确认注册结果，请稍后重试或尝试直接登录。"});
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand register-side">
        <Link className="brand" href="/"><span>Y</span> YehaoProxy</Link>
        <div>
          <span className="kicker">START FOR FREE</span>
          <h1>几分钟内开始<br/>你的全球业务</h1>
          <p>验证邮箱后即可使用完整客户控制台。</p>
        </div>
        <small>© 2026 YehaoProxy</small>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form register" onSubmit={submit}>
          <Link className="mobile-brand" href="/">← 返回首页</Link>
          <h2>创建账户</h2>
          <p>验证邮箱，开始管理你的代理网络</p>
          <label>姓名<input value={name} onChange={event=>setName(event.target.value)} required/></label>
          <label>工作邮箱<input type="email" value={email} onChange={event=>setEmail(event.target.value.trim())} placeholder="name@company.com" required/></label>
          <label>邮箱验证码<div className="verify-field">
            <input inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} placeholder="输入 6 位验证码" required/>
            <button data-ui="action" data-ui-tone="secondary" type="button" disabled={sendingCode || loading || seconds > 0} onClick={()=>void sendCode()}>{sendingCode ? "正在发送…" : seconds ? seconds + "s 后重发" : "获取验证码"}</button>
          </div></label>
          <label>设置密码<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" minLength={8} required/></label>
          {hint && <div className={hint.kind==="success"?"auth-success":"auth-error"} role={hint.kind==="success"?"status":"alert"}>{hint.message}</div>}
          <label className="remember"><input type="checkbox" required/> 我同意服务条款和隐私政策</label>
          <button data-ui="action" data-ui-tone="primary" className="primary auth-submit" disabled={loading || sendingCode}>{loading?"正在创建账户…":"验证邮箱并注册"}</button>
          <div className="auth-foot">已有账户？ <Link href="/login">直接登录</Link></div>
        </form>
      </section>
    </main>
  );
}
