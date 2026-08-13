"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import CustomerCreateTool from "./CustomerCreateTool";

type Customer = {id: string; email: string; name: string | null; role?: string};

export default function CustomerPasswordTool() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    const sync = () => setPortalTarget(document.querySelector(".customer-drawer .profile-header-actions"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, []);

  function showForCurrentCustomer() {
    const profileText = document.querySelector(".customer-drawer .customer-profile p")?.textContent || "";
    setEmail(profileText.split("·")[0]?.trim() || "");
    setMessage("");
    setSuccess(false);
    setOpen(true);
  }

  function close() {
    if (saving) return;
    setOpen(false);
    setEmail("");
    setPassword("");
    setConfirm("");
    setMessage("");
    setSuccess(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    if (password !== confirm) return setMessage("两次输入的密码不一致");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return setMessage("新密码至少 8 位，并同时包含字母和数字");
    }
    setSaving(true);
    const listResponse = await fetch(`/api/admin/customers?size=20&search=${encodeURIComponent(email.trim())}`);
    const listData = await listResponse.json();
    if (!listResponse.ok) {
      setSaving(false);
      return setMessage(listData.error || "客户查询失败");
    }
    const customer = (listData.items as Customer[]).find(item => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!customer) {
      setSaving(false);
      return setMessage("没有找到该邮箱对应的客户");
    }
    const response = await fetch(`/api/admin/customers/${customer.id}`, {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({password}),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(data.error || "密码修改失败");
    setSuccess(true);
    setMessage(`${customer.name || customer.email} 的密码已修改，原有登录会话已退出`);
    setPassword("");
    setConfirm("");
  }

  return <>
    <CustomerCreateTool/>
    {portalTarget && createPortal(<button className="customer-password-entry" onClick={showForCurrentCustomer}>修改密码</button>, portalTarget)}
    {open && <div className="modal customer-password-modal">
      <form onSubmit={submit}>
        <div><h2>修改客户密码</h2><button type="button" onClick={close}>×</button></div>
        <p className="modal-note">修改后，该客户当前所有登录会话都会失效，需要使用新密码重新登录。</p>
        <div className="form-grid">
          <label>客户登录邮箱<input type="email" value={email} readOnly required/></label>
          <label>新密码<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required placeholder="至少 8 位，包含字母和数字"/></label>
          <label>确认新密码<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required placeholder="再次输入新密码"/></label>
        </div>
        {message && <div className={success ? "offer-success password-result" : "live-error password-result"}>{success && <span>✓</span>}{message}</div>}
        <footer><button type="button" onClick={close}>取消</button><button className="primary" disabled={saving}>{saving ? "保存中…" : "确认修改"}</button></footer>
      </form>
    </div>}
  </>;
}
