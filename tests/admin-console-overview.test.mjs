import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {isAttentionExpiry, summarizeAttentionOrders} from "../lib/admin-attention.ts";

const source = await readFile(new URL("../app/admin/ConsoleOverview.tsx",import.meta.url),"utf8");
const customersApi = await readFile(new URL("../app/api/admin/customers/route.ts",import.meta.url),"utf8");
// Execute the actual pure helper without loading the client component or its browser imports.
const wifiHelperSource = source.slice(source.indexOf("function orderWifiNames("),source.indexOf("function WifiName("));
const orderWifiNames = new Function(`${stripTypeScriptTypes(wifiHelperSource)}; return orderWifiNames;`)();

test("admin overview requests sensitive sources only with their feature permission",()=>{
  assert.match(source,/finance = permissions\.includes\("finance"\)/);
  assert.match(source,/customers = permissions\.includes\("customers"\)/);
  assert.match(source,/if\(finance\)jobs\.push\(read<Insights>\("\/api\/admin\/insights"\)/);
  assert.match(source,/if\(customers\)jobs\.push\(read<[^\n]+\("\/api\/admin\/customers\?size=1"\)/);
  assert.match(source,/if\(manageOrders\)\{[\s\S]*?read<[^\n]+\("\/api\/admin\/orders\?size=50"\)/);
  assert.match(source,/if\(tickets\)jobs\.push\(read<[^\n]+\("\/api\/admin\/tickets"\)/);
  assert.match(source,/if\(requests\)jobs\.push\(read<[^\n]+\("\/api\/admin\/service-requests"\)/);
  assert.match(source,/customerCount = customers \? data\.customers\?\.total : undefined/);
  assert.match(source,/\{customers&&<th scope="col">客户<\/th>\}/);
  assert.match(source,/\{finance&&<th scope="col">金额<\/th>\}/);
  assert.match(customersApi,/requireAdminApi\("customers"\)/);
  assert.match(customersApi,/db\.select\(\{ value: sql<number>`count\(\*\)` \}\)\.from\(customers\)\.where\(where\)/);
  assert.match(customersApi,/total: Number\(countRows\[0\]\?\.value \|\| 0\)/);
});

test("admin overview uses record counts instead of double-counting wallet and order money as cash",()=>{
  assert.match(source,/label="已付款记录"/);
  assert.match(source,/月度订单记录数量/);
  assert.match(source,/含余额充值与服务子订单/);
  assert.match(source,/sum\+month\.orders/);
  assert.match(source,/point\.orders/);
  assert.doesNotMatch(source,/summary\.revenue|month\.revenue|point\.revenue|summary\.refunded/);
  assert.match(source,/serviceOrders=orders\.filter\(x=>x\.product!=="wallet-topup"\)/);
});

test("sidebar replaces unavailable network metrics with permission-scoped attention counts",async()=>{
  const [sidebar,api,shell,styles] = await Promise.all([
    "../app/admin/ConsoleAttentionSummary.tsx", "../app/api/admin/attention/route.ts",
    "../app/admin/LiveAdmin.tsx", "../app/console-visual-system.css",
  ].map(path=>readFile(new URL(path,import.meta.url),"utf8")));
  for(const label of ["待开通订单","待核验续费","7 天内到期服务","待回复工单","当前暂无待办"])assert.ok(sidebar.includes(label));
  assert.match(sidebar,/if \(!enabled\) return null/);
  assert.match(sidebar,/entries\.filter\(entry => permissions\.includes\(entry\.permission\)\)/);
  assert.match(sidebar,/useAdminRefresh\(load, enabled\)/);
  assert.match(sidebar,/\[load, activeTab\]/);
  assert.match(sidebar,/current === sequence\.current/);
  assert.match(sidebar,/onClick=\{\(\) => onNavigate\(entry\.tab\)\}/);
  assert.match(sidebar,/setCounts\(\{\}\); setFailed\(true\)/);
  assert.match(sidebar,/部分数量暂不可用，请重试/);
  assert.match(shell,/<ConsoleAttentionSummary permissions=\{permissions\} activeTab=\{permittedTab\} onNavigate=\{choose\}\/>/);
  assert.doesNotMatch(sidebar+source,/ConsoleNetworkSummary|\/api\/admin\/vps-operations|出口带宽|今日流量/);
  assert.match(api,/const access = await getAdminAccess\(\)/);
  assert.match(api,/if \(!canOrders && !canTickets\)/);
  assert.match(api,/if \(canOrders\) \{[\s\S]*?counts\.provision = counts\.review = counts\.expiring = null/);
  assert.match(api,/if \(canTickets\) \{[\s\S]*?counts\.tickets = null/);
  assert.match(api,/inArray\(tickets\.status,\["open","waiting_staff"\]\)/);
  assert.match(api,/notInArray\(tickets\.category,\[\.\.\.AFTER_SALES_TICKET_CATEGORIES\]\)/);
  assert.match(api,/Cache-Control":"no-store/);
  assert.doesNotMatch(api,/\.limit\(|\.offset\(|\.update\(|\.insert\(|customerEmail|encryptedPassword|host:|getVps/);
  assert.match(styles,/\.console-attention-list>button>b\.has-items/);
  assert.match(styles,/\.console-attention-summary button:focus-visible/);
});

const attentionNow = Date.parse("2026-11-09T00:00:00Z");
const attentionOrder = (values={})=>({product:"static-isp",status:"paid",durationDays:30,adminNote:null,expiresAt:null,...values});
test("attention counts all matching service orders without a recent-100 cutoff or recharge duplicates",()=>{
  const rows = Array.from({length:130},()=>attentionOrder());
  rows.push(attentionOrder({status:"provisioning"}));
  rows.push(attentionOrder({product:"computer-node"}));
  for(const values of [{product:"wallet-topup"},{product:"cart-bundle"},{durationDays:0},
    {adminNote:"[BILLING_MODE]one-time"},{status:"pending"},{status:"refunded"},
    {status:"failed"},{status:"active"}])rows.push(attentionOrder(values));
  assert.deepEqual(summarizeAttentionOrders(rows,attentionNow),{provision:132,review:0,expiringNodes:0});
});
test("attention renewal verification follows the existing manual-review states",()=>{
  const rows = ["pending","paid","provisioning","active","refunded","failed"].map(status=>
    attentionOrder({status,adminNote:"[RENEWAL_OF]original"}));
  rows.push(attentionOrder({status:"active",adminNote:"[RENEWAL_OF]original\n[RENEWAL_VERIFIED_AT]2026-11-08"}));
  assert.deepEqual(summarizeAttentionOrders(rows,attentionNow),{provision:0,review:3,expiringNodes:0});
});
test("seven-day attention excludes expired or undated services and does not double-count renewal nodes",()=>{
  for(const value of [null,"invalid",new Date(attentionNow-1),new Date(attentionNow),new Date(attentionNow+7*86400000+1)])assert.equal(isAttentionExpiry(value,attentionNow),false);
  for(const value of [new Date(attentionNow+1),new Date(attentionNow+7*86400000)])assert.equal(isAttentionExpiry(value,attentionNow),true);
  const expiresAt = new Date(attentionNow+3*86400000);
  const rows = [
    attentionOrder({product:"computer-node",status:"active",expiresAt}),
    attentionOrder({product:"soft-router",status:"active",expiresAt}),
    attentionOrder({product:"computer-node",status:"active",expiresAt,adminNote:"[RENEWAL_OF]original"}),
    attentionOrder({product:"computer-node",status:"refunded",expiresAt}),
    attentionOrder({status:"active",expiresAt}),
  ];
  assert.deepEqual(summarizeAttentionOrders(rows,attentionNow),{provision:0,review:1,expiringNodes:2});
});

test("admin order WiFi uses exact proxy services, not node server labels",()=>{
  assert.match(source,/<th scope="col">WiFi 名称<\/th>/);
  assert.match(source,/item\.kind==="proxy"/);
  assert.match(source,/item\.id===allocationIds\[0\]/);
  assert.match(source,/\.\.\.wifiFor\(order\)/);
  assert.match(source,/title=\{names\.length\?names\.join\("、"\):undefined\}/);
  assert.match(source,/<WifiName names=\{wifiFor\(order\)\}\/>/);
});

const proxyServices = [
  {id:"ip-1",kind:"proxy",orderId:"purchase-1",wifiName:"UK01"},
  {id:"ip-2",kind:"proxy",orderId:"purchase-1",wifiName:"UK02"},
  {id:"node-1",kind:"node",orderId:"purchase-1",wifiName:"Backend server, not WiFi"},
];
test("one-resource renewal shows only its exact WiFi from a two-resource purchase",()=>{
  assert.deepEqual(orderWifiNames({id:"renewal-1",quantity:1,adminNote:"[RENEWAL_OF]purchase-1\n[RENEW_ALLOCATION]ip-2"},proxyServices),["UK02"]);
  assert.deepEqual(orderWifiNames({id:"purchase-1",quantity:2},proxyServices),["UK01","UK02"]);
});
test("renewal with missing, unknown, mismatched or ambiguous resource stays empty",()=>{
  for(const note of [
    "[RENEWAL_OF]purchase-1",
    "[RENEWAL_OF]purchase-1\n[RENEW_ALLOCATION]unknown",
    "[RENEWAL_OF]different-purchase\n[RENEW_ALLOCATION]ip-2",
    "[RENEWAL_OF]purchase-1\n[RENEW_ALLOCATION]ip-1\n[RENEW_ALLOCATION]ip-2",
    "[RENEWAL_OF]purchase-1\n[RENEWAL_OF]different-purchase\n[RENEW_ALLOCATION]ip-1",
    "[RENEWAL_OF]purchase-1\n[RENEW_ALLOCATION]node-1",
  ])assert.deepEqual(orderWifiNames({id:"renewal-1",quantity:1,adminNote:note},proxyServices),[]);
});

test("scheduled task toggles reuse the shared track and expose their checked and disabled states",async()=>{
  const [tasks,styles,legacy] = await Promise.all([
    readFile(new URL("../app/admin/ScheduledTasks.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/scheduled-tasks.css",import.meta.url),"utf8"),
    readFile(new URL("../app/typography-sharp.css",import.meta.url),"utf8"),
  ]);
  for(const [label,field] of [["定时任务总开关","enabled"],["新购服务提醒","newOrderEnabled"],["人工开通超时提醒","provisioningEnabled"]]){
    assert.ok(tasks.includes(`<Switch label="${label}" value={config.${field}} disabled={busy}`));
  }
  assert.match(tasks,/type="button" role="switch" aria-label=\{label\} aria-checked=\{value\} disabled=\{disabled\}/);
  assert.match(tasks,/policy-toggle\$\{value\?/);
  assert.doesNotMatch(styles+legacy,/\.task-switch|\.scheduled-master(?:\.on)? button/);
  assert.match(styles,/\.scheduled-center \.policy-toggle:disabled\{[^}]*background:#cbd5df!important/);
  assert.match(styles,/\.scheduled-center \.policy-toggle\.on:disabled\{background:#2389ee!important/);
});

test("after-sales and credit headings use the shared light hero",async()=>{
  const [requests,credit] = await Promise.all([
    readFile(new URL("../app/admin/service-requests/RequestsClient.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/admin/CreditManagement.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(requests,/<section className="aftersales-hero business-hero">/);
  assert.match(credit,/<section className="credit-hero business-hero">/);
});

test("renewal table reserves a full status track and space for all columns",async()=>{
  const [columns,status] = await Promise.all([
    readFile(new URL("../app/sequence-columns.css",import.meta.url),"utf8"),
    readFile(new URL("../app/console-status-system.css",import.meta.url),"utf8"),
  ]);
  const grid = columns.match(/\.renewal-business-row\{([^}]+)\}/)?.[1];
  const tracks = grid?.match(/grid-template-columns:([^;]+)!important/)?.[1].match(/minmax\([^)]+\)|\d+px/g) || [];
  const badgeWidth = Number(status.match(/\bwidth:\s*(\d+)px\s*!important/)?.[1]);
  assert.equal(tracks.length,12);
  assert.ok(parseInt(tracks.at(-2),10)>=badgeWidth);
  const minTracks = tracks.reduce((sum,track)=>sum+Number(track.match(/\d+/)[0]),0);
  const gap = Number(grid.match(/column-gap:(\d+)px/)?.[1]);
  const padding = Number(grid.match(/padding-left:(\d+)px/)?.[1])+Number(grid.match(/padding-right:(\d+)px/)?.[1]);
  assert.ok(Number(grid.match(/min-width:(\d+)px/)?.[1])>=minTracks+(tracks.length-1)*gap+padding);
});
