"use client";
import { useEffect, useState } from "react";

type Admin = { id: string; email: string; name: string | null; status: string; createdAt: string };

export default function AdminAccounts() {
  const [items, setItems] = useState<Admin[]>([]);
  const [message, setMessage] = useState("");
  async function load() { const r = await fetch("/api/admin/admins"); const d = await r.json(); if (r.ok) setItems(d.items); else setMessage(d.error); }
  useEffect(() => { void load(); }, []);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const r = await fetch("/api/admin/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); setMessage(r.ok ? "管理员账户已创建" : d.error);
    if (r.ok) { form.reset(); void load(); }
  }
  async function toggle(item: Admin) {
    const r = await fetch(`/api/admin/customers/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: item.status === "active" ? "suspended" : "active" }) });
    const d = await r.json(); setMessage(r.ok ? "管理员状态已更新" : d.error); if (r.ok) void load();
  }
  return <div className="settings-stack">
    {message && <div className="settings-toast">{message}</div>}
    <div className="setting-card"><div className="setting-title"><div><h2>管理员账户</h2><p>管理后台登录账户，与客户账户完全分开显示</p></div><span>{items.length} 个账户</span></div>
      <div className="channel-list">{items.map(item => <article key={item.id}><i className={item.status === "active" ? "ok" : "off"}/><div><b>{item.name || item.email}</b><small>{item.email} · 创建于 {new Date(item.createdAt).toLocaleDateString()}</small></div><em>{item.status === "active" ? "已启用" : "已停用"}</em><button type="button" onClick={() => toggle(item)}>{item.status === "active" ? "停用" : "启用"}</button></article>)}</div>
    </div>
    <form className="setting-card" onSubmit={create}><div className="setting-title"><div><h2>新增管理员</h2><p>创建可登录运营后台的独立账户</p></div></div><div className="setting-grid"><label>管理员名称<input name="name" required placeholder="例如：运营主管"/></label><label>登录账号<input name="email" required placeholder="邮箱或用户名"/></label><label>初始密码<input name="password" type="password" minLength={8} required placeholder="至少 8 位"/></label></div><footer><button className="primary" type="submit">创建管理员</button></footer></form>
  </div>;
}
