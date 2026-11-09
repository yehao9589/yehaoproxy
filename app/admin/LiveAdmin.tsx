"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {AdminRefreshProvider, AdminRefreshButton} from "./AdminRefresh";
import ConsoleIcon, {type ConsoleIconName} from "../components/ConsoleIcon";
import useConsoleMobileMenu from "../components/useConsoleMobileMenu";
import ConsoleOverview from "./ConsoleOverview";
import ConsoleAttentionSummary from "./ConsoleAttentionSummary";
import ServicesClient from "./ServicesClient";
import XPanelSettings from "./settings/XPanelSettings";
import KomariSettings from "./settings/KomariSettings";
import VpsOperations from "./vps/VpsOperations";
import CustomerPasswordTool from "./customers/CustomerPasswordTool";
import FinancialDetails from "./FinancialDetails";
import CreditManagement from "./CreditManagement";
import CustomersClient from "./customers/CustomersClient";
import TicketsClient from "./tickets/TicketsClient";
import CouponClient from "./coupons/CouponClient";
import RequestsClient from "./service-requests/RequestsClient";
import SettingsClient, {type SettingsTab} from "./settings/SettingsClient";
import AdminAccounts from "./settings/AdminAccounts";
import SiteManagement from "./settings/SiteManagement";
import UpdateCenter from "./settings/UpdateCenter";
import ScheduledTasks from "./ScheduledTasks";
import AuditClient from "./audit/AuditClient";
import {FinanceModule, SalesModule} from "./BusinessModules";
import ProductsModule from "./ProductOffersModule";
import OrderCenter from "./OrderCenter";
import OrderManager from "./OrderManager";
import RenewalOrders from "./RenewalOrders";
import "../credit-admin.css";
import "../admin-pro.css";
import "../site-management.css";

export type AdminTab = "overview"|"orders"|"bills"|"product-orders"|"renewal-orders"|"services"|"vps"|"vps-overview"|"vps-monitor"|"vps-backups"|"vps-jobs"|"products"|"customers"|"finance"|"finance-ledger"|"finance-bills"|"finance-credit"|"sales"|"tickets"|"coupons"|"requests"|"automation"|"updates"|"settings-site"|"settings-general"|"settings-notifications"|"settings-suppliers"|"settings-payments"|"settings-security"|"settings-admins"|"audit";
type AdminBrand = {siteName:string; logoText:string; logoUrl:string};
type AdminProps = {email:string; roleName:string; permissions:string[]};
const titles:Record<AdminTab,string> = {
  overview:"运营概览", orders:"订单管理", bills:"账单管理", "product-orders":"产品订单", "renewal-orders":"续费订单", services:"服务管理", vps:"面板与流量", "vps-overview":"VPS 运行概览", "vps-monitor":"服务器监控", "vps-backups":"面板备份", "vps-jobs":"运维记录", products:"商品管理", customers:"客户管理", finance:"财务中心", "finance-ledger":"财务明细", "finance-bills":"财务明细", "finance-credit":"信用账期", sales:"销售业绩", tickets:"工单管理", coupons:"优惠券", requests:"售后申请", automation:"定时任务", updates:"在线更新", "settings-site":"站务管理", "settings-general":"基础设置", "settings-notifications":"通知中心", "settings-suppliers":"供应商", "settings-payments":"支付渠道", "settings-security":"安全策略", "settings-admins":"管理员账户", audit:"审计日志",
};
const tabPermission:Record<AdminTab,string> = {
  overview:"overview", orders:"orders", bills:"orders", "product-orders":"orders", "renewal-orders":"orders", services:"orders", vps:"settings", "vps-overview":"settings", "vps-monitor":"settings", "vps-backups":"settings", "vps-jobs":"settings", products:"products", customers:"customers", finance:"finance", "finance-ledger":"finance", "finance-bills":"finance", "finance-credit":"finance", sales:"sales", tickets:"tickets", coupons:"coupons", requests:"requests", automation:"automation", updates:"settings", "settings-site":"settings", "settings-general":"settings", "settings-notifications":"settings", "settings-suppliers":"settings", "settings-payments":"settings", "settings-security":"settings", "settings-admins":"admins", audit:"audit",
};
const adminGroups:Array<{id:string; label:string; icon:ConsoleIconName; items:Array<[AdminTab,string,ConsoleIconName]>}> = [
  {id:"workspace", label:"工作台", icon:"home", items:[["overview","运营概览","home"]]},
  {id:"business", label:"业务管理", icon:"layers", items:[["bills","账单管理","orders"],["product-orders","产品订单","orders"],["renewal-orders","续费订单","renew"],["services","服务管理","layers"],["products","商品管理","layers"],["customers","客户管理","users"]]},
  {id:"vps", label:"VPS 运维", icon:"server", items:[["vps-overview","运行概览","server"],["vps","面板与流量","network"],["vps-monitor","服务器监控","chart"],["vps-backups","面板备份","layers"],["vps-jobs","运维记录","clock"]]},
  {id:"finance", label:"财务运营", icon:"wallet", items:[["finance","财务中心","wallet"],["finance-ledger","财务明细","orders"],["finance-credit","信用账期","calendar"],["sales","销售业绩","chart"],["coupons","优惠券","wallet"]]},
  {id:"support", label:"客户服务", icon:"support", items:[["tickets","工单管理","support"],["requests","售后申请","renew"]]},
  {id:"system", label:"系统管理", icon:"settings", items:[["settings-site","站务管理","settings"],["settings-general","基础设置","settings"],["settings-notifications","通知中心","bell"],["settings-suppliers","供应商","server"],["settings-payments","支付渠道","wallet"],["settings-security","安全策略","check"],["settings-admins","管理员账户","users"],["updates","更新与备份","renew"],["automation","定时任务","clock"],["audit","审计日志","orders"]]},
];

export default function LiveAdmin(props:AdminProps) {
  return <AdminRefreshProvider><AdminContent {...props}/></AdminRefreshProvider>;
}

function AdminContent({email,roleName,permissions}:AdminProps) {
  const availableGroups = useMemo(()=>adminGroups.map(group=>({...group,items:group.items.filter(([key])=>permissions.includes(tabPermission[key]))})).filter(group=>group.items.length),[permissions]);
  const firstTab = availableGroups[0]?.items[0]?.[0] || "overview";
  const [tab,setTab] = useState<AdminTab>(firstTab);
  const [openGroup,setOpenGroup] = useState(availableGroups[0]?.id || "");
  const {mobileMenuOpen,setMobileMenuOpen,drawerRef,triggerRef,closeRef} = useConsoleMobileMenu("admin-mobile-menu-active");
  const [menuQuery,setMenuQuery] = useState("");
  const [brand,setBrand] = useState<AdminBrand>({siteName:"YehaoProxy",logoText:"Y",logoUrl:""});
  const [logoFailed,setLogoFailed] = useState(false);
  useEffect(()=>setLogoFailed(false),[brand.logoUrl]);
  const logoUrl = useMemo(()=>{
    if(!/^data:image\/png;base64,/i.test(brand.logoUrl))return brand.logoUrl;
    // Older saved configurations can contain a truncated PNG: its dimensions
    // still load, so the browser's error event alone cannot catch a blank logo.
    try{return atob(brand.logoUrl.split(",")[1]).includes("\u0000\u0000\u0000\u0000IEND")?brand.logoUrl:"";}catch{return "";}
  },[brand.logoUrl]);

  useEffect(()=>{
    void fetch("/api/site-config",{cache:"no-store"}).then(async response=>response.ok?setBrand(await response.json()):null).catch(()=>{});
    const update = (event:Event)=>setBrand((event as CustomEvent<AdminBrand>).detail);
    window.addEventListener("site-config-updated",update);
    return ()=>window.removeEventListener("site-config-updated",update);
  },[]);
  function choose(key:AdminTab) {
    if(!permissions.includes(tabPermission[key]))return;
    setTab(key);
    setOpenGroup(availableGroups.find(group=>group.items.some(item=>item[0]===key))?.id || "");
    setMobileMenuOpen(false);
  }
  const query = menuQuery.trim().toLowerCase();
  const permittedTab = permissions.includes(tabPermission[tab]) ? tab : firstTab;
  if(!availableGroups.length)return <main className="admin-pro console-admin"><section className="admin-work"><div className="admin-content"><div className="live-error">当前管理员尚未分配任何功能权限，请联系超级管理员。</div></div></section></main>;

  return <main className={`admin-pro console-admin${mobileMenuOpen?" mobile-nav-open":""}`}>
    <aside ref={drawerRef} id="admin-mobile-navigation" className="console-sidebar" aria-label="后台导航" role={mobileMenuOpen?"dialog":undefined} aria-modal={mobileMenuOpen||undefined}>
      <div className="admin-mobile-nav-head"><span>后台菜单</span><button ref={closeRef} type="button" aria-label="关闭菜单" onClick={()=>setMobileMenuOpen(false)}>×</button></div>
      {/* eslint-disable-next-line @next/next/no-img-element -- Configured site logos may use arbitrary storage URLs, without an image optimizer. */}
      <Link className="brand admin-live-brand" href="/"><span className={logoUrl&&!logoFailed?"has-logo":""}>{logoUrl&&!logoFailed?<img src={logoUrl} alt="" onError={()=>setLogoFailed(true)}/>:brand.logoText||"Y"}</span><b>{brand.siteName}</b></Link>
      <small className="admin-label">运营管理后台</small>
      <label className="console-search console-menu-search"><ConsoleIcon name="search"/><input aria-label="搜索后台菜单" placeholder="搜索菜单…" value={menuQuery} onChange={event=>setMenuQuery(event.target.value)}/></label>
      <nav className="admin-group-nav" aria-label="后台功能菜单">
        {availableGroups.map(group=>{
          const expanded = group.id==="workspace" || Boolean(query) || openGroup===group.id;
          const matchesGroup = group.label.toLowerCase().includes(query);
          const hasMatch = matchesGroup || group.items.some(item=>item[1].toLowerCase().includes(query));
          return <section key={group.id} hidden={!hasMatch} className={expanded?"open":""}>
            {group.id!=="workspace"&&<button type="button" className="admin-group-title" aria-expanded={expanded} onClick={()=>setOpenGroup(openGroup===group.id?"":group.id)}><ConsoleIcon name={group.icon}/><b>{group.label}</b><ConsoleIcon name="chevron" className="console-group-chevron"/></button>}
            <div hidden={!expanded}>{group.items.map(([key,label,icon])=><button type="button" data-tab={key} key={key} hidden={Boolean(query)&&!matchesGroup&&!label.toLowerCase().includes(query)} className={permittedTab===key?"on":""} aria-current={permittedTab===key?"page":undefined} onClick={()=>choose(key)}><ConsoleIcon name={icon}/><span>{label}</span></button>)}</div>
          </section>;
        })}
      </nav>
      <ConsoleAttentionSummary permissions={permissions} activeTab={permittedTab} onNavigate={choose}/>
      <div className="admin-user"><span className="admin-user-avatar"><ConsoleIcon name="users"/></span><div><b>{roleName}</b><small>{email}</small></div></div>
    </aside>
    <button type="button" className="admin-mobile-backdrop" tabIndex={-1} aria-label="关闭菜单" onClick={()=>setMobileMenuOpen(false)}/>
    <section className="admin-work" inert={mobileMenuOpen}>
      <header className="console-header">
        <button ref={triggerRef} type="button" className="admin-mobile-menu-button" aria-label="打开后台菜单" aria-controls="admin-mobile-navigation" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(true)}><ConsoleIcon name="layers"/> 菜单</button>
        <div className="console-header-title"><h1>{titles[permittedTab]}</h1></div>
        <div className="console-header-actions">
          <AdminRefreshButton className="console-refresh-button"/>
          {permissions.includes("orders")&&<button type="button" className="console-utility-button" onClick={()=>choose("product-orders")}><ConsoleIcon name="orders"/><span>订单管理</span></button>}
          {permissions.includes("tickets")&&<button type="button" className="console-utility-button" onClick={()=>choose("tickets")}><ConsoleIcon name="bell"/><span>工单管理</span></button>}
          <span className="console-header-account"><ConsoleIcon name="users"/>{roleName}</span>
        </div>
      </header>
      <div className="admin-content"><section key={permittedTab} className="admin-tab-panel"><Content tab={permittedTab} permissions={permissions} onNavigate={choose}/></section></div>
    </section>
  </main>;
}

function Content({tab,permissions,onNavigate}:{tab:AdminTab; permissions:string[]; onNavigate:(tab:AdminTab)=>void}) {
  if(tab==="overview")return <ConsoleOverview permissions={permissions} onNavigate={onNavigate}/>;
  if(tab==="bills")return <OrderManager kind="bills"/>;
  if(tab==="product-orders")return <OrderManager kind="products"/>;
  if(tab==="renewal-orders")return <RenewalOrders/>;
  if(tab==="orders")return <OrderCenter/>;
  if(tab==="services")return <ServicesClient/>;
  if(tab==="vps")return <XPanelSettings initialTab="xpanel" showProviderTabs={false}/>;
  if(tab==="vps-monitor")return <div className="vps-page business-page"><KomariSettings/></div>;
  if(tab==="vps-overview")return <VpsOperations view="overview"/>;
  if(tab==="vps-backups")return <VpsOperations view="backups"/>;
  if(tab==="vps-jobs")return <VpsOperations view="jobs"/>;
  if(tab==="products")return <ProductsModule/>;
  if(tab==="customers")return <><CustomerPasswordTool/><CustomersClient/></>;
  if(tab==="finance")return <FinanceModule/>;
  if(tab==="finance-ledger"||tab==="finance-bills")return <FinancialDetails/>;
  if(tab==="finance-credit")return <CreditManagement/>;
  if(tab==="sales")return <SalesModule/>;
  if(tab==="tickets")return <TicketsClient/>;
  if(tab==="coupons")return <CouponClient/>;
  if(tab==="requests")return <RequestsClient/>;
  if(tab==="automation")return <ScheduledTasks/>;
  if(tab==="updates")return <UpdateCenter/>;
  if(tab==="settings-site")return <SiteManagement/>;
  if(tab==="settings-admins")return <AdminAccounts/>;
  if(tab.startsWith("settings-"))return <SettingsClient initialTab={tab.replace("settings-","") as SettingsTab} standalone/>;
  return <AuditClient/>;
}
