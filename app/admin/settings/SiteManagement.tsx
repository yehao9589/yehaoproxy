"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteConfig } from "../../../lib/site-config";

export default function SiteManagement() {
  const [data, setData] = useState<SiteConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/site-config", { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "站务配置加载失败");
        setData(result);
      })
      .catch(error => setMessage(error.message || "站务配置加载失败"));
  }, []);

  function publishBrand(value: SiteConfig) {
    window.dispatchEvent(new CustomEvent("site-config-updated", { detail: value }));
  }

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
    if (!response.ok) return setMessage(result.error || "保存失败");
    setData(result.value);
    publishBrand(result.value);
    setMessage("站务设置已保存，并已同步到当前后台界面");
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setMessage("");
    try {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("仅支持 PNG、JPG 或 WEBP 图片");
      if (file.size > 2 * 1024 * 1024) throw new Error("Logo 图片不能超过 2MB");
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/admin/site-logo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: file.type, data: encoded }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Logo 上传失败");
      setData(current => {
        if (!current) return current;
        const next = { ...current, logoUrl: result.logoUrl };
        publishBrand(next);
        return next;
      });
      setMessage("Logo 已上传，并已同步到左上角品牌区域");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo 上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function deleteLogo() {
    if (!confirm("确定删除当前 Logo 图片吗？删除后将使用文字标识。")) return;
    setUploading(true);
    setMessage("");
    const response = await fetch("/api/admin/site-logo", { method: "DELETE" });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return setMessage(result.error || "Logo 删除失败");
    setData(current => {
      if (!current) return current;
      const next = { ...current, logoUrl: "" };
      publishBrand(next);
      return next;
    });
    setMessage("Logo 图片已删除，当前使用文字标识");
  }

  if (!data) return <div className="setting-card site-loading">{message || "正在加载站务配置…"}</div>;

  return <form className="site-management site-console" onSubmit={save}>
    {message && <div className="settings-toast">{message}</div>}

    <section className="site-hero">
      <div><small>SITE IDENTITY</small><h2>品牌与站务中心</h2><p>统一管理站点品牌、公告和页脚信息，保存后同步应用到前台与管理后台。</p></div>
      <div className="site-hero-brand">
        <span>{data.logoUrl ? <img src={data.logoUrl} alt="" /> : data.logoText}</span>
        <div><b>{data.siteName}</b><small>当前品牌预览</small></div>
      </div>
    </section>

    <section className="setting-card site-section">
      <header className="site-section-head"><span>01</span><div><h2>品牌标识</h2><p>用于网站页头、管理后台和通知邮件。</p></div></header>
      <div className="site-brand-workspace">
        <div className="site-logo-preview">
          <div className="site-logo-canvas">{data.logoUrl ? <img src={data.logoUrl} alt="Logo 预览" /> : <i>{data.logoText}</i>}</div>
          <small>完整 Logo 预览</small>
        </div>
        <div className="site-brand-fields">
          <div className="setting-grid">
            <label>站点名称<input name="siteName" value={data.siteName} onChange={e => setData({ ...data, siteName: e.target.value })} required /></label>
            <label>文字标识<input name="logoText" maxLength={4} value={data.logoText} onChange={e => setData({ ...data, logoText: e.target.value })} /></label>
            <input name="logoUrl" type="hidden" value={data.logoUrl} readOnly />
          </div>
          <div className="site-upload-row">
            <div><b>上传品牌图片</b><small>PNG、JPG、WEBP，最大 2MB；推荐透明背景横版或方形 Logo。</small></div>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.target.value = ""; }} />
            <button type="button" className="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "处理中…" : data.logoUrl ? "更换图片" : "上传图片"}</button>
            {data.logoUrl && <button type="button" className="danger-outline" disabled={uploading} onClick={deleteLogo}>删除</button>}
          </div>
        </div>
      </div>
    </section>

    <section className="setting-card site-section">
      <header className="site-section-head"><span>02</span><div><h2>顶部公告</h2><p>配置前台顶部公告及跳转链接。</p></div></header>
      <div className="setting-switch important"><div><b>显示顶部公告</b><small>关闭后前台不展示公告栏。</small></div><input name="topAdEnabled" type="checkbox" defaultChecked={data.topAdEnabled} /></div>
      <div className="setting-grid"><label className="wide">公告文字<input name="topAdText" defaultValue={data.topAdText} placeholder="输入需要展示的公告" /></label><label className="wide">跳转链接<input name="topAdLink" defaultValue={data.topAdLink} placeholder="/activity 或 https://..." /></label></div>
    </section>

    <section className="setting-card site-section">
      <header className="site-section-head"><span>03</span><div><h2>页脚信息</h2><p>配置公司、客服、版权与备案信息。</p></div></header>
      <div className="setting-grid"><label>公司 / 品牌名称<input name="companyName" defaultValue={data.companyName} /></label><label>客服邮箱<input name="supportEmail" type="email" defaultValue={data.supportEmail} /></label><label className="wide">页脚简介<input name="footerDescription" defaultValue={data.footerDescription} /></label><label className="wide">版权字段<input name="copyright" defaultValue={data.copyright} /></label><label className="wide">备案号<input name="icpNumber" defaultValue={data.icpNumber} placeholder="选填" /></label></div>
      <footer><button className="primary" disabled={saving}>{saving ? "保存中…" : "保存全部站务设置"}</button></footer>
    </section>
  </form>;
}
