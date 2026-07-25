"use client";

import { useEffect, useState } from "react";
import type { SiteConfig } from "../../../lib/site-config";

export default function SiteManagement() {
  const [data, setData] = useState<SiteConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "站务配置加载失败");
        setData(result);
      })
      .catch((error) => setMessage(error.message || "站务配置加载失败"));
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...raw, topAdEnabled: raw.topAdEnabled === "on" }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "保存失败");
      return;
    }
    setData(result.value);
    setMessage("站务配置已保存，前台刷新后立即生效");
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setMessage("");
    try {
      if (file.size > 2 * 1024 * 1024) {
        setMessage("Logo 图片不能超过 2MB");
        return;
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/admin/site-logo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: file.type, data }),
      });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : {};
      if (!response.ok) return setMessage(result.error || `Logo 上传失败（${response.status}）`);
      setData(current => current ? { ...current, logoUrl: result.logoUrl } : current);
      setMessage(result.storage === "filesystem"
        ? "Logo 已上传到服务器目录并立即生效"
        : "Logo 已上传并立即生效；当前预览环境使用数据库兼容存储");
    } catch {
      setMessage("Logo 上传失败，服务未返回有效结果");
    } finally {
      setUploading(false);
    }
  }

  async function deleteLogo() {
    if (!confirm("确定删除当前 Logo 图片吗？删除后将显示文字 Logo。")) return;
    setUploading(true);
    setMessage("");
    const response = await fetch("/api/admin/site-logo", { method: "DELETE" });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return setMessage(result.error || "Logo 删除失败");
    setData(current => current ? { ...current, logoUrl: "" } : current);
    setMessage("Logo 图片已删除，当前使用文字 Logo");
  }

  if (!data) {
    return <div className="setting-card">{message || "正在加载站务配置…"}</div>;
  }

  return (
    <form className="site-management" onSubmit={save}>
      {message && <div className="settings-toast">{message}</div>}

      <section className="setting-card">
        <div className="setting-title">
          <div>
            <h2>品牌与 Logo</h2>
            <p>管理前台页头和页脚使用的品牌标识。</p>
          </div>
          <span>站务管理</span>
        </div>
        <div className="site-brand-preview">
          {data.logoUrl ? <img src={data.logoUrl} alt="Logo 预览" /> : <i>{data.logoText}</i>}
          <b>{data.siteName}</b>
        </div>
        <div className="setting-grid">
          <label>站点名称<input name="siteName" defaultValue={data.siteName} required /></label>
          <label>Logo 文字<input name="logoText" maxLength={4} defaultValue={data.logoText} /></label>
          <input name="logoUrl" type="hidden" value={data.logoUrl} readOnly />
          <div className="wide site-logo-upload">
            <div>
              <b>Logo 图片</b>
              <small>支持 PNG、JPG、WEBP，最大 2MB；建议使用透明背景横版 Logo。</small>
            </div>
            <label className="site-upload-button">
              {uploading ? "处理中…" : data.logoUrl ? "重新上传" : "上传 Logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
                event.target.value = "";
              }} />
            </label>
            {data.logoUrl && <button type="button" className="danger-outline" disabled={uploading} onClick={deleteLogo}>删除图片</button>}
          </div>
        </div>
      </section>

      <section className="setting-card">
        <div className="setting-title">
          <div>
            <h2>顶部广告</h2>
            <p>控制网站顶部公告栏的内容和跳转链接。</p>
          </div>
        </div>
        <div className="setting-switch important">
          <div>
            <b>显示顶部广告</b>
            <small>关闭后前台顶部公告栏会完全隐藏。</small>
          </div>
          <input name="topAdEnabled" type="checkbox" defaultChecked={data.topAdEnabled} />
        </div>
        <div className="setting-grid">
          <label className="wide">广告文字<input name="topAdText" defaultValue={data.topAdText} /></label>
          <label className="wide">跳转链接<input name="topAdLink" defaultValue={data.topAdLink} placeholder="/activity 或 https://..." /></label>
        </div>
      </section>

      <section className="setting-card">
        <div className="setting-title">
          <div>
            <h2>底部信息</h2>
            <p>配置公司、客服、版权和备案信息。</p>
          </div>
        </div>
        <div className="setting-grid">
          <label>公司 / 品牌名称<input name="companyName" defaultValue={data.companyName} /></label>
          <label>客服邮箱<input name="supportEmail" type="email" defaultValue={data.supportEmail} /></label>
          <label className="wide">页脚简介<input name="footerDescription" defaultValue={data.footerDescription} /></label>
          <label className="wide">版权字段<input name="copyright" defaultValue={data.copyright} /></label>
          <label className="wide">备案号<input name="icpNumber" defaultValue={data.icpNumber} placeholder="选填" /></label>
        </div>
        <footer>
          <button className="primary" disabled={saving}>
            {saving ? "保存中…" : "保存全部站务设置"}
          </button>
        </footer>
      </section>
    </form>
  );
}
