import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {serviceExpiryDisplay,serviceExpiryTime} from "../lib/service-expiry-display.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [orders, orderClient, ledger, proxy, node, expired, status, theme, support, adminColumns] = await Promise.all([
  "app/customer-orders.css",
  "app/dashboard/orders/OrderClient.tsx",
  "app/dashboard/wallet/ledger-services.css",
  "app/proxy-search.css",
  "app/customer-service-header.css",
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

test("order rows reserve room for the shared badge and complete payment labels", () => {
  const [base, wide] = bodies(orders, ".order-customer-page .order-customer-table .orow");
  const tracks = trackMinimums(prop(base, "grid-template-columns"));
  assert.equal(tracks.length, 9, "ten columns including the responsive action track");
  assert.ok(tracks.at(-1) >= statusWidth);
  assert.doesNotMatch(ledger, /\.order-customer-table/, "wallet styles must not override the order tracks");
  assert.match(orders, /@container customer-orders \(min-width:1384px\)/);
  assert.equal(prop(base, "--order-actions-columns"), "1");
  assert.equal(prop(wide, "--order-actions-columns"), "2");
  const actionLayout = bodies(orders, ".order-customer-page .customer-order-actions").at(-1);
  const button = bodies(orders, ".order-customer-page .customer-order-actions :is(a,button)")[0];
  const busyLabel = orderClient.match(/paying===o\.id\?"([^"]+)":"立即支付"/)?.[1];
  assert.ok(busyLabel);
  const reservedTextWidth = [...busyLabel].length * px(prop(button, "font-size"));
  const paddingAndBorder = 2 * (Number(prop(button, "padding").match(/ (\d+)px$/)[1]) + px(prop(button, "border")));
  const [actionCell] = bodies(orders, ".order-customer-page .order-customer-table .orow>span:last-child");
  const cellPadding = 2 * px(prop(actionCell, "padding-inline"));
  for (const row of [base, wide]) {
    const count = Number(prop(row, "--order-actions-columns"));
    const width = px(prop(row, "--order-actions-width"));
    assert.ok((width - cellPadding - (count - 1) * px(prop(actionLayout, "gap"))) / count >= reservedTextWidth + paddingAndBorder);
  }
  assert.equal(prop(button, "white-space"), "normal");
  assert.equal(prop(button, "overflow"), undefined);
});

test("order and after-sales headers keep their padding and a compact action", () => {
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

test("order actions stay at the visible edge and the table can be focused to scroll", () => {
  const [cell] = bodies(orders, ".order-customer-page .order-customer-table .orow>span:last-child");
  assert.equal(prop(cell, "position"), "sticky");
  assert.equal(prop(cell, "inset-inline-end"), "0");
  assert.equal(prop(cell, "background"), "inherit");
  assert.match(orderClient, /className="standalone-table order-customer-table" role="region"[^>]*tabIndex=\{0\}/);
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
  const [nodeActions] = bodies(node, ".unified-console .managed-node-table .node-service-actions");
  assert.equal(prop(nodeActions, "grid-area"), "actions");
  assert.match(prop(nodeActions, "grid-template-columns"), /auto-fit/);
  assert.equal(prop(nodeActions, "min-width"), "0");
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
