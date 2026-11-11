"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../console.css";
import type { ConsoleBrandConfig } from "../../lib/site-config";
import ConsoleBrand from "../components/ConsoleBrand";
import ConsoleIcon, { type ConsoleIconName } from "../components/ConsoleIcon";
import useConsoleMobileMenu from "../components/useConsoleMobileMenu";
import ConsoleOverview from "./ConsoleOverview";
import ProxiesClient from "./proxies/ProxiesClient";
import OrderClient from "./orders/OrderClient";
import RequestsClient from "./requests/RequestsClient";
import WalletClient from "./wallet/WalletClient";
import CreditBillsClient from "./credit-bills/CreditBillsClient";
import WhitelistClient from "./whitelist/WhitelistClient";
import SupportClient from "./support/SupportClient";
import NotificationClient from "./notifications/NotificationClient";
import ImpersonationBanner from "./ImpersonationBanner";

export type DashboardTab =
  | "overview"
  | "proxies"
  | "orders"
  | "requests"
  | "wallet"
  | "credit-bills"
  | "whitelist"
  | "support"
  | "notifications";

const navigation: { id: DashboardTab; label: string; icon: ConsoleIconName }[] = [
  { id: "overview", label: "账户概览", icon: "home" },
  { id: "proxies", label: "我的服务", icon: "layers" },
  { id: "orders", label: "订单管理", icon: "orders" },
  { id: "wallet", label: "余额与流水", icon: "wallet" },
  { id: "credit-bills", label: "信用账单", icon: "orders" },
  { id: "requests", label: "售后申请", icon: "renew" },
  { id: "support", label: "工单支持", icon: "support" },
  { id: "notifications", label: "消息通知", icon: "bell" },
  { id: "whitelist", label: "IP 白名单", icon: "network" },
];

export default function LiveDashboard({ name, impersonating, brand }: { name: string; impersonating: boolean; brand: ConsoleBrandConfig }) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab") || "overview";
  const tab = navigation.some(item => item.id === requested) ? requested as DashboardTab : "overview";
  const current = navigation.find(item => item.id === tab)!;
  const { mobileMenuOpen, setMobileMenuOpen, drawerRef, triggerRef, closeRef } = useConsoleMobileMenu("dashboard-mobile-menu-active");
  const [menuQuery, setMenuQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  function choose(id: DashboardTab) {
    setMobileMenuOpen(false);
    router.push(id === "overview" ? "/dashboard" : `/dashboard?tab=${id}`);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("退出失败，请稍后重试");
      location.href = "/login";
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "退出失败，请稍后重试");
      setLoggingOut(false);
    }
  }

  const visibleNavigation = navigation.filter(item => item.label.toLowerCase().includes(menuQuery.trim().toLowerCase()));

  return (
    <main className={`console unified-console customer-console${mobileMenuOpen ? " mobile-nav-open" : ""}`}>
      <aside ref={drawerRef} className="console-side" id="dashboard-mobile-navigation" aria-label="客户中心导航" role={mobileMenuOpen ? "dialog" : undefined} aria-modal={mobileMenuOpen || undefined}>
        <div className="dashboard-mobile-nav-head">
          <span>客户中心菜单</span>
          <button ref={closeRef} type="button" aria-label="关闭菜单" onClick={() => setMobileMenuOpen(false)}>×</button>
        </div>
        <ConsoleBrand brand={brand} />
        <label className="console-sidebar-search">
          <ConsoleIcon name="search" />
          <input aria-label="搜索客户中心菜单" placeholder="搜索菜单…" value={menuQuery} onChange={event => setMenuQuery(event.target.value)} />
        </label>
        <nav className="console-menu">
          {visibleNavigation.map(item => (
            <button type="button" key={item.id} className={tab === item.id ? "on" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => choose(item.id)}>
              <ConsoleIcon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          {!visibleNavigation.length && <p className="console-menu-empty">没有匹配的菜单</p>}
        </nav>
        <div className="console-side-footer">
          <button type="button" className="dashboard-logout" disabled={loggingOut} onClick={() => void logout()}><ConsoleIcon name="logout" />{loggingOut ? "正在退出…" : "退出登录"}</button>
          <div className="console-side-context"><ConsoleIcon name="users" /><span>客户中心</span></div>
        </div>
      </aside>
      <button type="button" className="dashboard-mobile-backdrop" tabIndex={-1} aria-label="关闭菜单" onClick={() => setMobileMenuOpen(false)} />
      <section className="console-body" inert={mobileMenuOpen}>
        <header className={`console-top console-header${impersonating ? " is-impersonating" : ""}`}>
          <button ref={triggerRef} type="button" className="dashboard-mobile-menu-button" aria-label="打开客户中心菜单" aria-controls="dashboard-mobile-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}>
            <ConsoleIcon name="layers" /> 菜单
          </button>
          <div className={`dashboard-context${tab==="orders"?" dashboard-context--orders":""}`}>
            <div>{tab==="orders"?<h1>{current.label}</h1>:<b>{current.label}</b>}<small>客户中心</small></div>
          </div>
          <div className="top-actions">
            {tab === "overview" && <button data-ui="action" data-ui-tone="secondary" type="button" className="outline console-refresh" disabled={overviewLoading} onClick={() => setRefreshKey(value => value + 1)}><ConsoleIcon name="renew" />{overviewLoading ? "正在刷新" : "刷新数据"}</button>}
            <a data-ui="action" data-ui-tone="primary" className="console-top-purchase" href="/#pricing" aria-label="购买服务"><ConsoleIcon name="plus" /><span>购买服务</span></a>
            <button type="button" className="console-top-notifications" onClick={() => choose("notifications")}><ConsoleIcon name="bell" /><span>消息通知</span></button>
            <span className="avatar">{name.trim().slice(0, 1).toUpperCase() || "Y"}</span>
            <div className="dashboard-account"><b>{name}</b><small>客户账户</small></div>
          </div>
          {impersonating && <ImpersonationBanner />}
        </header>
        <div className="console-content">
          {logoutError && <div className="live-error" role="alert">{logoutError}</div>}
          <section className="dashboard-tab-panel" key={tab}>
            {tab === "overview" ? <ConsoleOverview refreshKey={refreshKey} onLoading={setOverviewLoading} setTab={choose} /> : <Module tab={tab} />}
          </section>
        </div>
      </section>
    </main>
  );
}

function Module({ tab }: { tab: Exclude<DashboardTab, "overview"> }) {
  if (tab === "proxies") return <ProxiesClient />;
  if (tab === "orders") return <OrderClient />;
  if (tab === "requests") return <RequestsClient />;
  if (tab === "wallet") return <WalletClient />;
  if (tab === "credit-bills") return <CreditBillsClient />;
  if (tab === "whitelist") return <WhitelistClient />;
  if (tab === "support") return <SupportClient />;
  return <NotificationClient />;
}
