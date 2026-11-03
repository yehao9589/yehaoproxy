import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {duplicateWifiNames, normalizeWifiName, suggestWifiName, wifiNameDuplicateMessage} from "../lib/wifi-name.ts";
import {customerWifiNameDuplicates} from "../lib/customer-wifi-name.ts";
import {DatabaseSync} from "node:sqlite";
import {drizzle} from "drizzle-orm/sqlite-proxy";

const item=(wifiName,extra={})=>({id:wifiName||"empty",wifiName,createdAt:"2026-11-01T00:00:00Z",...extra});

test("increments the previous code and strips surrounding descriptions",()=>{
  for(const name of ["UK18","UK18-电脑","电脑UK18","直播 · UK18-电脑"," UK18 "]){
    assert.deepEqual(suggestWifiName([item(name)]),{previousName:name.trim(),suggestedName:"UK19"});
  }
});

test("preserves prefix case and zero padding, including rollover",()=>{
  assert.equal(suggestWifiName([item("uk009-电脑")]).suggestedName,"uk010");
  assert.equal(suggestWifiName([item("JP99")]).suggestedName,"JP100");
  assert.equal(suggestWifiName([item("008")]).suggestedName,"009");
  assert.equal(suggestWifiName([item("UK9007199254740993")]).suggestedName,"UK9007199254740994");
});

test("uses actual delivery time instead of order creation or expiry",()=>{
  const history=[
    item("UK18",{id:"first",createdAt:"2026-01-01",note:"[ACTIVATED_AT]2026-11-02T01:00:00.001Z"}),
    item("UK50",{id:"second",createdAt:"2026-11-01",note:"[ACTIVATED_AT]2026-11-02T01:00:00.000Z"}),
  ];
  assert.deepEqual(suggestWifiName(history),{previousName:"UK18",suggestedName:"UK19"});
  assert.equal(history[0].id,"first","history is not reordered in place");
});

test("legacy batches choose the highest numbered name when delivery times are absent",()=>{
  assert.deepEqual(suggestWifiName([item("UK9"),item("UK18"),item("UK10")]),{previousName:"UK18",suggestedName:"UK19"});
  assert.equal(suggestWifiName([item("UK17",{note:"[ACTIVATED_AT]invalid"}),item("UK18")]).suggestedName,"UK19");
});

test("skips previously used numbers, including names with descriptions",()=>{
  const history=[item("UK18",{createdAt:"2026-11-02"}),item("uk19-电脑"),item("UK20"),item("US21")];
  assert.deepEqual(suggestWifiName(history),{previousName:"UK18",suggestedName:"UK21"});
});

test("custom names without a code remain custom; empty history stays blank",()=>{
  assert.deepEqual(suggestWifiName([]),{previousName:null,suggestedName:null});
  assert.deepEqual(suggestWifiName([item(null),item(" ")]),{previousName:null,suggestedName:null});
  assert.deepEqual(suggestWifiName([item("办公室",{createdAt:"2026-11-02"}),item("UK18")]),{previousName:"办公室",suggestedName:null});
});

test("successive deliveries use the last saved custom or suggested name",()=>{
  const history=[item("UK18")];
  for(const [name,time] of [["UK19","01"],["UK20","02"],["自定义UK50-电脑","03"]]){
    history.push(item(name,{note:`[ACTIVATED_AT]2026-11-02T00:00:${time}Z`}));
  }
  assert.equal(suggestWifiName(history).suggestedName,"UK51");
});

test("duplicate matching ignores case, outer spaces and full-width variants, but compares the full name",()=>{
  const history=[item("UK18",{id:"a"}),item(" ｕｋ１８ ",{id:"b"}),item("UK18-电脑",{id:"c"})];
  assert.deepEqual(duplicateWifiNames(history," uk18 ").map(row=>row.id),["a","b"]);
  assert.deepEqual(duplicateWifiNames(history,"UK18-电脑").map(row=>row.id),["c"]);
  assert.equal(normalizeWifiName(" ＵＫ１８ "),"uk18");
  assert.deepEqual(duplicateWifiNames(history,"UK18","a").map(row=>row.id),["b"]);
  assert.deepEqual(duplicateWifiNames(history," "),[]);
  assert.equal(wifiNameDuplicateMessage("UK18",0),null);
  assert.match(wifiNameDuplicateMessage("UK18",2),/2 个其他服务/);
});

test("database duplicate lookup covers all products/countries only for the same customer and excludes the edited IP",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  try{
    sqlite.exec(`CREATE TABLE orders(id TEXT,customer_email TEXT,product TEXT,region TEXT);
      CREATE TABLE proxy_allocations(id TEXT,order_id TEXT,wifi_name TEXT,host TEXT,port INTEGER,status TEXT);
      INSERT INTO orders VALUES('uk','alice@example.com','static-isp','GB'),('us','alice@example.com','datacenter','US'),('other','bob@example.com','static-isp','GB');
      INSERT INTO proxy_allocations VALUES('self','uk','UK18','192.0.2.1',443,'active'),('same','us','uk18','192.0.2.2',443,'expired'),('other-customer','other','UK18','192.0.2.3',443,'active');`);
    const db=drizzle(async(sql,params)=>{
      const statement=sqlite.prepare(sql);statement.setReturnArrays(true);
      return{rows:statement.all(...params)};
    });
    const all=await customerWifiNameDuplicates(db,"alice@example.com","UK18");
    assert.deepEqual(all.map(row=>row.id),["self","same"]);
    const editing=await customerWifiNameDuplicates(db,"alice@example.com","UK18","self");
    assert.equal(editing.length,1);
    assert.equal(editing[0].address,"192.0.2.2:443");
    assert.equal(editing[0].status,"expired");
    assert.equal(editing[0].orderId,"us");
    assert.deepEqual(await customerWifiNameDuplicates(db,"nobody@example.com","UK18"),[]);
    assert.deepEqual(await customerWifiNameDuplicates(db,"alice@example.com",null),[]);
  }finally{sqlite.close()}
});

test("new delivery and existing resource edits show warnings without blocking save and recheck on the server",async()=>{
  const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
  const [manual,edit,deliveryApi,editApi,hint,lookup,customer]=await Promise.all([
    read("app/ManualAllocationEnhancer.tsx"),read("app/OrderResourceEnhancer.tsx"),
    read("app/api/admin/orders/[id]/route.ts"),read("app/api/admin/orders/[id]/resources/[allocationId]/route.ts"),
    read("app/WifiNameDuplicateHint.tsx"),read("app/api/admin/orders/[id]/wifi-name/route.ts"),read("app/admin/customers/CustomersClient.tsx"),
  ]);
  assert.match(manual,/<WifiNameDuplicateHint orderId=\{open.targetOrderId\}/);
  assert.match(edit,/excludeAllocationId=\{edit.allocationId\}/);
  assert.match(customer,/allocationId: d.id/);
  assert.match(customer,/wifiName: d.wifiName/);
  assert.match(hint,/controller.abort\(\)/);
  assert.match(hint,/check.key !== key/);
  assert.match(hint,/也可保留此名称继续保存/);
  assert.match(lookup,/customerWifiNameDuplicates\(db, order.customerEmail/);
  assert.match(deliveryApi,/customerWifiNameDuplicates\(db,order.customerEmail,wifiName\)/);
  assert.match(editApi,/customerWifiNameDuplicates\(db,order.customerEmail,wifiName,row.id\)/);
  assert.match(deliveryApi,/wifiNameWarning:wifiNameDuplicateMessage/);
  assert.match(editApi,/wifiNameWarning:wifiNameDuplicateMessage/);
  const services=await read("app/admin/ServicesClient.tsx");
  assert.match(services,/wifiDuplicateKeys.has\(wifiNameKey\(item\)\)/);
  assert.match(services,/名称重复/);
  assert.match(services,/item.customerEmail.trim\(\).toLowerCase\(\)/);
});

test("delivery UI and APIs keep customer/service scope, customization and fresh suggestions",async()=>{
  const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
  const [history,api,ui,lookup]=await Promise.all([
    read("lib/customer-wifi-name.ts"),read("app/api/admin/orders/[id]/route.ts"),
    read("app/ManualAllocationEnhancer.tsx"),read("app/api/admin/orders/[id]/wifi-name/route.ts"),
  ]);
  for(const field of ["customerEmail","product","region"]) assert.match(history,new RegExp(`eq\\(orders\\.${field}, ${field}\\)`));
  assert.doesNotMatch(history,/eq\(proxyAllocations.status/);
  assert.match(api,/wifiNameSuggestion:targetOrder\?await customerWifiNameSuggestion/);
  assert.match(api,/withRequestLock\(`wifi-name:/);
  assert.match(api,/wifiNameMode==="auto"\?\(await customerWifiNameSuggestion/);
  assert.match(api,/:requestedWifiName/);
  assert.match(ui,/上次：/);
  assert.match(ui,/value=\{wifiName\}/);
  assert.match(ui,/form.reset\(\);applyDelivery\(delivery\)/);
  assert.match(ui,/wifiNameMode:wifiAutomatic.current\?"auto":"custom"/);
  assert.match(ui,/sequence!==wifiRequest.current/);
  assert.match(lookup,/requireAdminApi\("orders"\)/);
  assert.match(lookup,/"cache-control": "no-store"/);
  assert.match(lookup,/order.customerEmail, order.product, region/);
});
