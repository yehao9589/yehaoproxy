import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {serviceExpiryDisplay,serviceExpiryTime} from "../lib/service-expiry-display.ts";
import {renewalCutoffDays,serviceBeyondExpiry,SERVICE_DAY_MS} from "../lib/customer-service-expiry.ts";
import {walletLedgerQuery,walletPageBounds} from "../lib/wallet-ledger-query.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [orders, orderClient, ledger, proxy, node, expired, status, theme, support, adminColumns] = await Promise.all([
  "app/dashboard/orders/order-desk.css",
  "app/dashboard/orders/OrderClient.tsx",
  "app/dashboard/wallet/ledger-services.css",
  "app/proxy-search.css",
  "app/dashboard/proxies/node-services.css",
  "app/dashboard/proxies/expired-services.css",
  "app/console-status-system.css",
  "app/console-visual-system.css",
  "app/dashboard/support/SupportClient.tsx",
  "app/sequence-columns.css",
].map(read));

const bodies = (css, selector) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(match => match[1].trim() === selector)
  .map(match => match[2]);
const prop = (body, name) => new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`).exec(body)?.[1].trim().replace(/\s*!important$/, "");
const px = value => Number(value?.match(/^(\d+)px/)?.[1]);
const trackMinimums = value => [...value.matchAll(/minmax\((\d+)px,[^)]+\)|(\d+)px/g)].map(match => Number(match[1] || match[2]));
const statusWidth = Number(/\bwidth:\s*(\d+)px\s*!important/.exec(status)[1]);

const serviceNow=Date.parse("2026-11-09T00:00:00Z");
const serviceAt=delta=>new Date(serviceNow+delta).toISOString();
test("customer renewal cutoff uses configured elapsed days and does not close on the boundary",()=>{
  assert.equal(renewalCutoffDays(null),30);
  assert.equal(renewalCutoffDays("14"),14);
  assert.equal(renewalCutoffDays("1.5"),30);
  assert.equal(serviceBeyondExpiry(serviceAt(-30*SERVICE_DAY_MS),30,serviceNow),false);
  assert.equal(serviceBeyondExpiry(serviceAt(-30*SERVICE_DAY_MS-1),30,serviceNow),true);
  assert.equal(serviceBeyondExpiry(null,30,serviceNow),false);
  assert.equal(serviceBeyondExpiry(serviceAt(-15*SERVICE_DAY_MS),14,serviceNow),true);
});

test("wallet filters include the full Beijing day and handle calendar boundaries",()=>{
  const query=walletLedgerQuery(new URLSearchParams("from=2026-11-09&to=2026-11-09"));
  assert.equal(query.start.toISOString(),"2026-11-08T16:00:00.000Z");
  assert.equal(query.endExclusive.toISOString(),"2026-11-09T16:00:00.000Z");
  assert.equal(walletLedgerQuery(new URLSearchParams("to=2024-02-29")).endExclusive.toISOString(),"2024-02-29T16:00:00.000Z");
  assert.equal(walletLedgerQuery(new URLSearchParams("from=2026-11-09")).endExclusive,null);
  for(const params of ["from=2026-02-30","to=2026-11-31","from=2026-11-10&to=2026-11-09"]){
    assert.throws(()=>walletLedgerQuery(new URLSearchParams(params)),/日期/);
  }
});

test("wallet paging defaults to site size and can reach records beyond the former limit",()=>{
  assert.deepEqual(walletLedgerQuery(new URLSearchParams("page=-1&size=999"),50),{page:1,size:50,start:null,endExclusive:null});
  assert.deepEqual(walletPageBounds(6,20,123),{page:6,size:20,total:123,offset:100});
  assert.deepEqual(walletPageBounds(1000,20,123),{page:7,size:20,total:123,offset:120});
  assert.deepEqual(walletPageBounds(2,20,0),{page:1,size:20,total:0,offset:0});
});
test("service expiry presentation distinguishes real boundaries without changing the 48-hour policy",()=>{
  assert.equal(serviceExpiryDisplay(serviceAt(48*3600000+1),serviceNow).state,"active");
  assert.equal(serviceExpiryDisplay(serviceAt(48*3600000),serviceNow).state,"expiring");
  assert.deepEqual(serviceExpiryDisplay(serviceAt(20*60000),serviceNow),{state:"expiring",label:"即将到期",remaining:"剩余 20 分钟"});
  assert.deepEqual(serviceExpiryDisplay(serviceAt(0),serviceNow),{state:"expired",label:"已到期",remaining:"到期不足 1 小时"});
  assert.equal(serviceExpiryDisplay(serviceAt(-3*86400000),serviceNow).remaining,"已到期 3 天");
  assert.equal(serviceExpiryDisplay(serviceAt(-2*3600000),serviceNow).remaining,"已到期 2 小时");
  for(const value of [null,"","not-a-date"]){
    assert.equal(serviceExpiryDisplay(value,serviceNow).state,"unknown");
    assert.equal(serviceExpiryTime(value),null);
  }
  assert.deepEqual(serviceExpiryTime(serviceAt(0)),{date:"2026/11/09",time:"08:00"});
});

test("admin services give expiry its own state column and keep renewal mode plain",async()=>{
  const [client,layout]=await Promise.all([read("app/admin/ServicesClient.tsx"),read("app/service-management.css")]);
  assert.match(client,/<span className="service-state-column">服务状态<\/span>/);
  assert.match(client,/data-service-state=\{expiry\.state\}/);
  assert.match(client,/className=\{`console-status-badge \$\{expiry\.state\}`\}/);
  assert.match(client,/serviceExpiryDisplay\(item\.expiresAt,clock\)\.state===expiryFilter/);
  assert.match(client,/正常服务/);
  assert.doesNotMatch(client,/全部有效服务/);
  const billing=client.slice(client.indexOf('<span className="service-billing-cell">'),client.indexOf('<span className="service-expiry-cell">'));
  assert.doesNotMatch(billing,/<em|data-ui="status"/);
  assert.match(billing,/自动续费":"手动续费/);
  const [row]=bodies(layout,".service-admin-table .service-row");
  const tracks=trackMinimums(prop(row,"grid-template-columns"));
  assert.equal(tracks.length,10);
  assert.ok(tracks[8]>=statusWidth+8);
  assert.ok(px(prop(row,"min-width"))>=tracks.reduce((sum,n)=>sum+n,0)+9*px(prop(row,"gap"))+2*px(prop(row,"padding")));
  assert.match(layout,/\.service-row\.is-expired\{[^}]*background:#fff8f9!important;box-shadow:inset 3px 0 0 #dc5264!important/);
  assert.match(layout,/\.is-expired \.service-expiry-cell b\{color:#ba263b!important/);
  const [actions]=bodies(layout,".service-admin-table .service-actions-cell");
  assert.equal(prop(actions,"position"),"sticky");
  assert.equal(prop(actions,"right"),"0");
  const [state]=bodies(layout,".service-admin-table .service-state-column");
  assert.equal(prop(state,"position"),"sticky");
  assert.equal(prop(state,"right"),"106px");
  assert.match(client,/className="service-admin-table" tabIndex=\{0\} role="region"/);
});

test("long order numbers yield space without shrinking the service type icons",async()=>{
  const [client,layout]=await Promise.all([read("app/admin/ServicesClient.tsx"),read("app/service-management.css")]);
  const [identity]=bodies(layout,".service-admin-table .service-identity");
  const [icon]=bodies(layout,".service-admin-table .service-kind-icon");
  const [label]=bodies(layout,".service-admin-table .service-identity-text");
  const [order]=bodies(layout,".service-admin-table .service-identity-text>small");
  assert.equal(prop(identity,"display"),"grid");
  assert.equal(prop(identity,"grid-template-columns"),"34px minmax(0,1fr)");
  assert.equal(prop(icon,"width"),"34px");
  assert.equal(prop(icon,"height"),"34px");
  assert.equal(prop(icon,"white-space"),"nowrap");
  assert.equal(prop(label,"min-width"),"0");
  assert.equal(prop(order,"text-overflow"),"ellipsis");
  assert.match(client,/className="service-identity-text"[^\n]+<small title=\{item\.orderId\}>/);
});

test("order list reserves the fixed status width and keeps mobile actions in view", () => {
  const [narrow] = bodies(orders, ".order-desk-row");
  const [wide] = bodies(orders, ".order-desk-labels,\n  .order-desk-row");
  const tracks = trackMinimums(prop(wide, "grid-template-columns"));
  assert.equal(tracks.length, 6);
  assert.ok(tracks[4] >= statusWidth);
  assert.doesNotMatch(ledger, /\.order-desk/, "wallet styles must not override the order workspace");
  const breakpoint = Number(orders.match(/@container order-desk \(min-width: (\d+)px\)/)?.[1]);
  const minimum = tracks.reduce((sum, track) => sum + track, 0) + 5 * px(prop(wide, "column-gap")) + 2 * px(prop(wide, "padding-inline")) + 2;
  assert.ok(breakpoint >= minimum && breakpoint <= 740, "keep an aligned list on ordinary desktop and tablet widths");
  assert.match(prop(narrow, "grid-template-areas"), /"identity status"[\s\S]*"actions actions"/);
  const [actions] = bodies(orders, ".order-desk-actions");
  const [button] = bodies(orders, ".order-desk-actions :is(a,button)");
  assert.equal(prop(actions, "flex-wrap"), "wrap");
  assert.equal(prop(button, "white-space"), "normal");
  assert.equal(prop(button, "overflow"), undefined);
});

test("after-sales header keeps its padding and a compact action", () => {
  const header = ".unified-console .customer-page>header.customer-order-page-header";
  const [desktop, mobile] = bodies(theme, header);
  const [action] = bodies(theme, `${header}>a.primary`);
  assert.equal(prop(desktop, "display"), "flex");
  assert.equal(prop(desktop, "flex-wrap"), "wrap");
  assert.equal(prop(desktop, "justify-content"), "space-between");
  assert.equal(prop(desktop, "padding"), "20px 24px");
  assert.equal(prop(mobile, "padding"), "16px");
  assert.equal(prop(action, "width"), "auto");
});

test("order workspace exposes status filters, search, readable order numbers and the payment actions", () => {
  assert.match(orderClient, /role="group" aria-label="按订单状态筛选"/);
  assert.match(orderClient, /aria-pressed=\{statusFilter===id\}/);
  assert.match(orderClient, /type="search" aria-label="搜索订单"/);
  assert.match(orderClient, /visible\.slice\(offset,offset\+pageSize\)/);
  assert.match(orderClient, /title=\{o\.id\} onClick=\{\(\)=>setDetail\(o\)\}/);
  assert.match(orderClient, /paying===o\.id\?"正在创建支付…":"立即支付"/);
  assert.match(orderClient, /onClick=\{\(\)=>void closeOrder\(o\)\}/);
  assert.doesNotMatch(orderClient, /querySelectorAll|order-customer-table|order-desk-heading|购买服务/, "the dashboard header already supplies the order title and purchase action");
});

test("ticket creation scrolls fields independently of its action footer", () => {
  const [dialog] = bodies(theme, ".unified-console .customer-ticket-modal.customer-ticket-create");
  const [fields] = bodies(theme, ".unified-console .customer-ticket-create-body");
  const [edges] = bodies(theme, ".unified-console .customer-ticket-create>header,.unified-console .customer-ticket-create>footer");
  assert.equal(prop(dialog, "display"), "flex");
  assert.equal(prop(dialog, "overflow"), "hidden");
  assert.equal(prop(fields, "min-height"), "0");
  assert.equal(prop(fields, "overflow-y"), "auto");
  assert.equal(prop(edges, "flex-shrink"), "0");
  assert.match(support, /<div className="customer-ticket-create-body">[\s\S]+?<\/div>\s*<footer>[\s\S]*?type="submit"/);
});

test("the order workspace note uses the available section width and only resizes vertically", async () => {
  const [workspace, layout] = await Promise.all([
    read("app/admin/OrderDetailWorkspace.tsx"),
    read("app/admin-integrated.css"),
  ]);
  assert.match(workspace, /className="order-admin-note"[^]*?<div className="admin-note"><textarea name="adminNote"/);
  const [field] = bodies(layout, ".order-form-grid input,.order-form-grid select,.admin-note textarea");
  assert.equal(prop(field, "width"), "100%");
  assert.equal(prop(field, "box-sizing"), "border-box");
  const [note] = bodies(layout, ".order-workspace .order-admin-note textarea");
  assert.equal(prop(note, "max-width"), "100%");
  assert.equal(prop(note, "resize"), "vertical");
});

test("compact customer list keeps the real keyboard-accessible action buttons", () => {
  const [actions] = bodies(adminColumns, ".customer-center .customer-table .customer-row:not(.head)>.customer-actions");
  assert.equal(prop(actions, "grid-column"), "2/-1");
  assert.equal(prop(actions, "display"), "flex");
  assert.equal(prop(actions, "flex-wrap"), "wrap");
  assert.doesNotMatch(adminColumns, /\.customer-row>span:last-child\{display:none\}/);
});

test("customer proxy and node actions have room and usable targets", () => {
  const proxyTable = ".proxy-management-page .managed-proxy-table";
  const [row] = bodies(proxy, `${proxyTable} .orow`);
  const tracks = trackMinimums(prop(row, "grid-template-columns"));
  assert.equal(tracks.length, 12);
  assert.ok(tracks.at(-2) >= statusWidth);
  assert.ok(tracks.at(-1) >= 2 * 44 + 5);
  assert.ok(px(prop(row, "min-width")) >= tracks.reduce((total, track) => total + track, 0) + 11 * px(prop(row, "column-gap")) + 20);
  const proxyActions = bodies(proxy, `${proxyTable} .proxy-row-actions>:is(button,a)`);
  assert.ok(px(prop(proxyActions[0], "min-height")) >= 32);
  assert.ok(px(prop(proxyActions[1], "min-height")) >= 44);
  assert.ok(px(prop(bodies(proxy, `${proxyTable} .proxy-note-cell>button`)[0], "width")) >= 30);
  const [nodeActions] = bodies(node, ".customer-node-auto,.customer-node-actions");
  assert.equal(prop(nodeActions, "display"), "flex");
  assert.equal(prop(nodeActions, "flex-wrap"), "wrap");
  assert.equal(prop(nodeActions, "min-width"), "0");
  const [singleColumn] = bodies(node, ".customer-node-grid");
  assert.equal(prop(singleColumn, "grid-template-columns"), "minmax(0,1fr)");
  const cardLayouts = bodies(node, ".customer-node-card").map(body => prop(body, "grid-template-columns")).filter(Boolean);
  assert.equal(cardLayouts[0], "minmax(0,1fr)");
  assert.ok(cardLayouts.some(value => value.startsWith("minmax(155px,") && value.includes("minmax(294px,")));
});

test("proxy regions keep the country and city together and hide the decoration in narrow cells", async () => {
  const [cell] = bodies(proxy, ".proxy-management-page .managed-proxy-table .proxy-region-cell");
  assert.equal(prop(cell, "max-width"), "none");
  assert.equal(prop(cell, "container"), "proxy-region / inline-size");
  const [label] = bodies(proxy, ".managed-proxy-table .proxy-region-cell .country-label>span:last-child");
  assert.equal(prop(label, "white-space"), "nowrap");
  assert.equal(prop(label, "text-overflow"), "ellipsis");
  assert.match(proxy, /@container proxy-region \(width < 108px\)\{\s*\.managed-proxy-table \.proxy-region-cell :is\(\.country-mark,\.country-mark-global\)\{display:none\}/);
  const client = await read("app/dashboard/proxies/ProxiesClient.tsx");
  assert.match(client, /<CountryLabel country=\{x\.region\}>\{\x60\$\{x\.countryName\|\|countryName\(x\.region\)\}\/\$\{cityName\(x\.city\)\}\x60\}<\/CountryLabel><\/b><small>\{x\.protocol\}<\/small>/);
});

test("expired services are horizontally scrollable whenever their own container is narrow", () => {
  assert.match(expired, /^\.expired-services-list\{[^}]*overflow-x:auto/m);
  for (const body of bodies(expired, ".expired-service-line")) {
    const tracks = trackMinimums(prop(body, "grid-template-columns"));
    assert.ok(tracks[5] >= statusWidth);
    const padding = Number(prop(body, "padding").match(/(?:^| )(\d+)px$/)[1]);
    assert.ok(px(prop(body, "min-width")) >= tracks.reduce((total, track) => total + track, 0) + 7 * px(prop(body, "gap")) + 2 * padding);
  }
});
