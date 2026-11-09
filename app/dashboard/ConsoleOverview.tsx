"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConsoleIcon from "../components/ConsoleIcon";
import Pagination from "../Pagination";
import { usePageSize } from "../usePageSize";
import { countryFlag, countryName } from "../../lib/countries";
import { normalizeCityName } from "../../lib/cities";
import { dashboardJson } from "./data-cache";
import type { DashboardTab } from "./LiveDashboard";
import { buildOverviewServices, overviewCounts, type ExpiryPolicy, type OverviewOrder, type OverviewProxy, type OverviewService, type ServiceStatus } from "./console-overview-data";

type Wallet = { balance: number; frozen: number; currency: string; currencySymbol: string; decimalPlaces?: number };
type Data = { wallet: Wallet; proxies: OverviewProxy[]; orders: OverviewOrder[]; entitlements: OverviewOrder[]; policy: ExpiryPolicy; waitingTickets: number | null };
type ApiError = { error?: string };
type ServiceTab = "all" | "proxy" | "node" | "expired";
type StatusFilter = "all" | ServiceStatus;

const productNames: Record<string, string> = {
  "static-isp": "静态住宅 IP",
  "static-residential": "静态住宅 IP",
  "dynamic-residential": "动态住宅代理",
  datacenter: "数据中心代理",
  "soft-router": "软路由中转",
  "computer-node": "电脑节点",
};
const statusNames: Record<ServiceStatus, string> = { active: "使用中", expiring: "即将到期", expired: "已到期", provisioning: "待开通" };

function regionLabel(service: OverviewService) {
  const region = service.countryName && service.countryName !== service.region ? service.countryName : countryName(service.region);
  return [region, normalizeCityName(service.city)].filter(Boolean).join(" · ") || "未设置地区";
}

function expiryLabel(service: OverviewService) {
  if (service.status === "provisioning") return "开通后计时";
  if (!service.expiresAt) return "长期";
  const date = new Date(service.expiresAt);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function ConsoleOverview({ refreshKey, onLoading, setTab }: { refreshKey: number; onLoading: (loading: boolean) => void; setTab: (tab: DashboardTab) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [serviceTab, setServiceTab] = useState<ServiceTab>("all");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    onLoading(true);
    setError("");
    try {
      const [wallet, proxies, orders, settings, tickets] = await Promise.all([
        dashboardJson<ApiError & { wallet?: Wallet }>("/api/wallet", { force }),
        dashboardJson<ApiError & { items?: OverviewProxy[] }>("/api/proxies", { force }),
        dashboardJson<ApiError & { items?: OverviewOrder[]; entitlements?: OverviewOrder[] }>("/api/orders", { force }),
        dashboardJson<ApiError & { expiredServiceGraceDays?: number; expiredServiceArchiveDays?: number }>("/api/proxies/settings", { force }),
        dashboardJson<ApiError & { items?: { status: string }[] }>("/api/tickets", { force }).catch(() => null),
      ]);
      if ([wallet, proxies, orders, settings, tickets].some(result => result?.status === 401)) {
        location.href = "/login";
        return;
      }
      const failed = [wallet, proxies, orders, settings].find(result => !result.ok);
      if (failed || !wallet.data.wallet) throw new Error(failed?.data.error || "账户数据加载失败，请稍后重试");
      const grace = Number(settings.data.expiredServiceGraceDays ?? 7);
      const archive = Number(settings.data.expiredServiceArchiveDays ?? 30);
      setData({
        wallet: wallet.data.wallet,
        proxies: proxies.data.items || [],
        orders: orders.data.items || [],
        entitlements: orders.data.entitlements || orders.data.items || [],
        policy: { graceDays: Number.isFinite(grace) ? Math.max(0, grace) : 7, archiveDays: Number.isFinite(archive) ? Math.max(0, archive) : 30 },
        waitingTickets: tickets?.ok ? (tickets.data.items || []).filter(ticket => ticket.status === "waiting_customer").length : null,
      });
      setNow(Date.now());
    } catch (error) {
      setError(error instanceof Error ? error.message : "账户数据加载失败，请稍后重试");
    } finally {
      setLoading(false);
      onLoading(false);
    }
  }, [onLoading]);

  useEffect(() => { void load(refreshKey > 0); }, [load, refreshKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const services = useMemo(() => data ? buildOverviewServices(data.proxies, data.entitlements, data.policy, now) : [], [data, now]);
  const counts = useMemo(() => overviewCounts(services, data?.orders || [], data?.wallet.currency), [services, data]);
  const currentServices = services.filter(service => !service.movedToExpired);
  const expiredServices = services.filter(service => service.movedToExpired);
  const tabCounts = { all: currentServices.length, proxy: currentServices.filter(service => service.kind === "proxy").length, node: currentServices.filter(service => service.kind === "node").length, expired: expiredServices.length };
  const regions = [...new Set(services.map(service => service.region).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b), "zh-CN"));
  const normalizedQuery = query.trim().toLowerCase();
  const visible = services.filter(service => {
    if (serviceTab === "expired" ? !service.movedToExpired : service.movedToExpired) return false;
    if (serviceTab === "proxy" || serviceTab === "node") if (service.kind !== serviceTab) return false;
    if (region !== "all" && service.region !== region) return false;
    if (status !== "all" && service.status !== status) return false;
    return !normalizedQuery || [service.address, service.wifiName, service.note, service.region, regionLabel(service), productNames[service.product] || ""].some(value => value.toLowerCase().includes(normalizedQuery));
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const money = (value: number) => `${data?.wallet.currencySymbol || "¥"}${Number(value || 0).toFixed(Math.max(0, Math.min(4, data?.wallet.decimalPlaces ?? 2)))}`;
  const unpaidAmount = counts.unpaidByCurrency.length ? counts.unpaidByCurrency.map(({ currency, amount }) => currency === data?.wallet.currency ? money(amount) : `${currency} ${amount.toFixed(2)}`).join(" + ") : money(0);
  const unavailable = !data;

  function selectTab(value: ServiceTab) {
    setServiceTab(value);
    setStatus("all");
    setPage(1);
  }

  function resetFilters() {
    setQuery("");
    setRegion("all");
    setStatus("all");
    setPage(1);
  }

  return (
    <div className="console-overview customer-overview" aria-busy={loading}>
      {noticeVisible && <div className="console-notice"><ConsoleIcon name="bell" /><span>续费与到期提醒可在消息通知中设置。</span><button type="button" onClick={() => setTab("notifications")}>查看设置 <ConsoleIcon name="arrow" /></button><button type="button" className="console-notice-close" aria-label="关闭提醒提示" onClick={() => setNoticeVisible(false)}>×</button></div>}
      {error && <div className="live-error" role="alert">{data ? "刷新失败，当前显示上次加载的数据：" : ""}{error}<button type="button" disabled={loading} onClick={() => void load(true)}>重试</button></div>}

      <div className="console-kpi-grid console-stat-grid">
        <article className="console-stat-card">
          <div className="console-kpi-label console-stat-label"><ConsoleIcon name="wallet" /><span>账户余额</span></div>
          <strong className="console-kpi-value console-stat-value">{unavailable ? "—" : money(data.wallet.balance)}</strong>
          <div className="console-kpi-meta console-stat-meta"><span>{unavailable ? loading ? "正在读取账户" : "余额数据暂不可用" : `冻结 ${money(data.wallet.frozen)}`}</span><button type="button" onClick={() => setTab("wallet")}>充值 <ConsoleIcon name="arrow" /></button></div>
        </article>
        <article className="console-stat-card">
          <div className="console-kpi-label console-stat-label"><ConsoleIcon name="layers" /><span>有效服务</span></div>
          <strong className="console-kpi-value console-stat-value">{unavailable ? "—" : counts.active}</strong>
          <div className="console-kpi-meta console-stat-meta"><span>{unavailable ? loading ? "正在读取服务" : "服务数据暂不可用" : `${counts.activeProxies} 个代理 IP · ${counts.activeNodes} 个节点`}</span></div>
        </article>
        <article className="console-stat-card">
          <div className="console-kpi-label console-stat-label"><ConsoleIcon name="clock" /><span>即将到期</span></div>
          <strong className="console-kpi-value console-stat-value">{unavailable ? "—" : counts.expiring}</strong>
          <div className="console-kpi-meta console-stat-meta"><span>7 天内到期</span></div>
        </article>
        <article className="console-stat-card">
          <div className="console-kpi-label console-stat-label"><ConsoleIcon name="orders" /><span>待付款订单</span></div>
          <strong className="console-kpi-value console-stat-value">{unavailable ? "—" : counts.unpaid}</strong>
          <div className="console-kpi-meta console-stat-meta"><span>{unavailable ? loading ? "正在读取订单" : "订单数据暂不可用" : `待支付金额 ${unpaidAmount}`}</span></div>
        </article>
      </div>

      <div className="console-reminder-strip">
        <div className="console-reminder-item"><ConsoleIcon name="clock" /><span>{unavailable ? "服务到期提醒" : counts.expiring ? `${counts.expiring} 项服务即将到期` : "暂无即将到期服务"}</span><button type="button" onClick={() => setTab("proxies")}>{counts.expiring ? "去续费" : "管理服务"}<ConsoleIcon name="chevron" /></button></div>
        <div className="console-reminder-item"><ConsoleIcon name="orders" /><span>{unavailable ? "待付款订单提醒" : counts.unpaid ? `${counts.unpaid} 笔订单待付款` : "暂无待付款订单"}</span><button type="button" onClick={() => setTab("orders")}>{counts.unpaid ? "去付款" : "查看订单"}<ConsoleIcon name="chevron" /></button></div>
        <div className="console-reminder-item"><ConsoleIcon name="support" /><span>{data?.waitingTickets == null ? "工单处理动态" : data.waitingTickets ? `${data.waitingTickets} 条工单待您回复` : "暂无待回复工单"}</span><button type="button" onClick={() => setTab("support")}>查看工单<ConsoleIcon name="chevron" /></button></div>
      </div>

      <section className="console-card console-services-card" aria-labelledby="customer-services-title">
        <div className="console-card-heading"><h2 id="customer-services-title"><ConsoleIcon name="layers" />我的服务</h2><button type="button" onClick={() => setTab("proxies")}>管理全部服务 <ConsoleIcon name="chevron" /></button></div>
        <div className="console-toolbar console-service-toolbar">
          <nav className="console-service-tabs" aria-label="服务分类">
            {([{ id: "all", name: "全部服务" }, { id: "proxy", name: "代理 IP" }, { id: "node", name: "节点服务" }, { id: "expired", name: "已到期服务" }] as const).map(item => <button type="button" key={item.id} className={serviceTab === item.id ? "on" : ""} aria-pressed={serviceTab === item.id} onClick={() => selectTab(item.id)}>{item.name}<b>{unavailable ? "—" : tabCounts[item.id]}</b></button>)}
          </nav>
          <label className="console-search console-service-search"><ConsoleIcon name="search" /><input aria-label="搜索我的服务" placeholder="搜索 IP、WiFi 名称或备注" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        </div>
        <div className="console-service-filters">
          <label><span>国家/地区</span><select aria-label="筛选国家或地区" value={region} onChange={event => { setRegion(event.target.value); setPage(1); }}><option value="all">全部</option>{regions.map(value => <option value={value} key={value}>{countryName(value)}</option>)}</select></label>
          <label><span>状态</span><select aria-label="筛选服务状态" value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1); }}><option value="all">全部</option>{(Object.entries(statusNames) as [ServiceStatus, string][]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <button type="button" onClick={resetFilters}>重置</button>
        </div>
        {serviceTab === "expired" && data && <p className="console-expiry-help">到期超过 {data.policy.graceDays} 天的服务移入此处，超过 {data.policy.archiveDays} 天后隐藏；续费后将重新分类。</p>}
        <div className="console-table-scroll console-service-table-wrap">
          <table className="console-table console-service-table">
            <caption className="console-visually-hidden">客户自己的代理 IP 与节点服务</caption>
            <thead><tr><th scope="col">序号</th><th scope="col">服务信息</th><th scope="col">国家 / 地区</th><th scope="col">WiFi 名称</th><th scope="col">备注</th><th scope="col">到期时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
            <tbody>
              {pageRows.map((service, index) => <tr key={service.key}>
                <td className="console-service-sequence">{(currentPage - 1) * pageSize + index + 1}</td>
                <td><div className="console-service-cell"><b className={service.address ? "mono" : ""}>{service.address || (service.kind === "proxy" ? "等待分配" : productNames[service.product] || "节点服务")}</b><small className="console-service-kind">{service.kind === "proxy" ? productNames[service.product] || "代理 IP" : "节点服务"}</small></div></td>
                <td><span className="console-service-region"><span aria-hidden="true">{countryFlag(service.region)}</span>{regionLabel(service)}</span></td>
                <td>{service.wifiName || "—"}</td>
                <td><span className="console-service-note" title={service.note || undefined}>{service.note || "—"}</span></td>
                <td className="console-service-expiry">{expiryLabel(service)}</td>
                <td><span data-ui="status" className={`console-status-badge console-service-status ${service.status}`}><i aria-hidden="true" />{statusNames[service.status]}</span></td>
                <td><div className="console-row-actions"><button data-ui="action" data-ui-tone="secondary" type="button" onClick={() => setTab("proxies")}>查看</button>{service.status !== "provisioning" && <button data-ui="action" data-ui-tone="secondary" type="button" onClick={() => setTab("proxies")}>续费</button>}</div></td>
              </tr>)}
              {!pageRows.length && <tr><td colSpan={8}><div className="console-empty console-empty-state">{loading && !data ? "正在加载您的服务…" : !data ? "服务数据暂不可用，请点击重试。" : services.length ? "没有符合当前筛选条件的服务" : "暂无服务，购买并完成开通后将在这里显示。"}{data && !services.length && <a href="/#pricing">购买服务 <ConsoleIcon name="arrow" /></a>}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination total={visible.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={value => { setPageSize(value); setPage(1); }} />
      </section>
    </div>
  );
}
