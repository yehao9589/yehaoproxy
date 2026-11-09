import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readdir} from 'node:fs/promises';
import ts from 'typescript';

const statusCss=await readFile(new URL('../app/console-status-system.css',import.meta.url),'utf8');
const css=statusCss.replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
const footprint=rules.find(rule=>/\bwidth:\s*92px\s*!important/.test(rule.body));
const [layout,themeSource,iconSource,adminShell,customerShell,adminOverview,customerOverview,packageSource,mobileMenu]=await Promise.all([
  '../app/layout.tsx','../app/console-visual-system.css','../app/components/ConsoleIcon.tsx',
  '../app/admin/LiveAdmin.tsx','../app/dashboard/LiveDashboard.tsx',
  '../app/admin/ConsoleOverview.tsx','../app/dashboard/ConsoleOverview.tsx','../package.json','../app/components/useConsoleMobileMenu.ts'
].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
const theme=themeSource.replace(/\/\*[\s\S]*?\*\//g,'');
const controls=await readFile(new URL('../app/control-visual-system.css',import.meta.url),'utf8');
const themeRules=[...theme.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
const compact=value=>value.replace(/\s+/g,'');
const themeRule=selector=>themeRules.find(rule=>compact(rule.selector)===compact(selector));

test('柔色操作层只作用于明确标记的控件，不给所有按钮或容器重新定宽',()=>{
  assert.match(controls,/@layer soft-controls\s*\{/);
  assert.match(controls,/\[data-ui="action"\]\{/);
  assert.doesNotMatch(controls,/(?:^|[{}])\s*(?:button|\.admin-pro button|\.unified-console button)\s*\{/);
  assert.doesNotMatch(controls,/\[class[*^$|~]?=/);
  const action=controls.match(/\[data-ui="action"\]\{([^}]+)\}/)[1];
  assert.doesNotMatch(action,/(?:^|;)\s*(?:width|min-width|max-width|flex-basis)\s*:/);
  assert.match(action,/min-height:36px!important/);
  assert.match(controls,/min-height:44px!important/);
  assert.match(controls,/prefers-reduced-motion:reduce/);
  assert.match(controls,/data-ui-tone="text"/);
  assert.match(controls,/aria-disabled="true"/);
});

test('操作按钮显式标记覆盖两端和公共页面，开关、分页、密码眼睛仍是专用控件',async()=>{
  async function sources(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async entry=>{
    const url=new URL(`${entry.name}${entry.isDirectory()?'/':''}`,dir);
    return entry.isDirectory()?sources(url):entry.name.endsWith('.tsx')?[{path:url.pathname,text:await readFile(url,'utf8')}]:[];
  }))).flat();}
  const files=await sources(new URL('../app/',import.meta.url));
  let actions=0,statuses=0;
  for(const file of files){
    const sf=ts.createSourceFile(file.path,file.text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node){
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
        const attrs=node.attributes.properties;
        const value=name=>attrs.find(attr=>attr.name?.getText(sf)===name)?.initializer?.getText(sf)||'';
        if(value('data-ui')==='"action"'){
          actions++;
          assert.doesNotMatch(value('role'),/switch|checkbox/);
          assert.ok(!attrs.some(attr=>attr.name?.getText(sf)==='aria-checked'));
          assert.doesNotMatch(value('className'),/policy-toggle|sale-toggle|notify-switch|proxy-copy-value|table-time-sort-arrow|mobile-backdrop/);
          assert.ok(!file.path.endsWith('/Pagination.tsx')&&!file.path.endsWith('/DatePickerLayer.tsx'));
        }
        if(value('data-ui')==='"status"')statuses++;
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
  }
  assert.ok(actions>200);assert.ok(statuses>35);
  for(const suffix of ['/admin/service-requests/RequestsClient.tsx','/admin/RenewalOrders.tsx','/dashboard/orders/OrderClient.tsx','/dashboard/proxies/ProxiesClient.tsx','/login/page.tsx','/register/page.tsx','/page.tsx']){
    assert.ok(files.find(file=>file.path.endsWith(`/app${suffix}`))?.text.includes('data-ui="action"'),suffix);
  }
});

test('状态层保留退款回转箭头、到期红色和续费待核验的独立语义',()=>{
  assert.match(controls,/\.refunded\{[^}]*--ui-status-icon:var\(--ui-status-refund\)/);
  assert.match(controls,/\.expired-service-badge\{[^}]*--ui-status-fg:var\(--ui-expired-text\)/);
  assert.match(controls,/\.renewal-business-row \.order-status:is\(\.paid,\.provisioning\)/);
  assert.match(controls,/\.bkp-copy-status,\.update-history-status\)\.failed/);
  assert.match(footprint.selector,/\.bill-financial/);
  assert.match(footprint.selector,/\.bill-progress/);
  assert.doesNotMatch(footprint.selector,/\.bill-kind/);
  assert.doesNotMatch(controls,/content:\s*["'][^"']*[\u4e00-\u9fff]/);
});

test('正常按钮和状态文字的配色至少达到 4.5 比 1 对比度',()=>{
  const colors=Object.fromEntries([...controls.matchAll(/--([\w-]+):(#(?:[\da-f]{6}))/gi)].map(([,key,color])=>[key,color]));
  const luminance=hex=>{
    const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const pairs=[['ui-blue','#ffffff'],['ui-secondary','ui-action-text'],['ui-danger-bg','ui-danger'],
    ...['neutral','success','warning','info','expiring','expired','refund'].map(key=>[`ui-${key}-bg`,`ui-${key}-text`])];
  for(const [bg,fg]of pairs){const a=luminance(colors[bg]),b=luminance(fg.startsWith('#')?fg:colors[fg]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${bg}/${fg}`);}
});

function declaration(body,property){
  const escaped=property.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`,'m').exec(body)?.[1].trim();
}

test('状态徽标在管理端和客户中心统一为 92 × 26，文字双向居中',()=>{
  assert.ok(footprint,'must have one shared status footprint');
  assert.match(footprint.selector,/:is\(\.admin-pro,\s*\.unified-console\)/);
  for(const property of ['width','min-width','max-width'])assert.equal(declaration(footprint.body,property),'92px !important');
  for(const property of ['height','min-height','max-height'])assert.equal(declaration(footprint.body,property),'26px !important');
  assert.equal(declaration(footprint.body,'box-sizing'),'border-box !important');
  assert.equal(declaration(footprint.body,'display'),'inline-flex !important');
  assert.equal(declaration(footprint.body,'align-items'),'center !important');
  assert.equal(declaration(footprint.body,'justify-content'),'center !important');
  assert.equal(declaration(footprint.body,'text-align'),'center !important');
  assert.equal(declaration(footprint.body,'flex-shrink'),'0 !important');
  assert.equal(declaration(footprint.body,'flex-basis'),'auto !important','a column flex parent must not turn width into a 92px height');
});

test('手机端不缩窄徽标，较长的现有状态可以换行而不会被省略',()=>{
  assert.doesNotMatch(css,/@media|@container/,'the unconditional footprint also applies on mobile');
  assert.equal(declaration(footprint.body,'white-space'),'normal !important');
  assert.equal(declaration(footprint.body,'line-height'),'12px !important');
  assert.equal(declaration(footprint.body,'overflow-wrap'),'anywhere');
  assert.doesNotMatch(footprint.body,/ellipsis|line-clamp|overflow\s*:\s*hidden/);
  assert.doesNotMatch(css,/(?:^|[;{])\s*content\s*:/,'CSS must not replace the original status text');
});

test('只选择明确状态标签，不改变操作按钮、开关、状态栏或结构容器',()=>{
  assert.doesNotMatch(css,/\[\s*class\s*[*^$|~]?\s*=/,'no partial class-name matching');
  assert.doesNotMatch(css,/\[role\s*=\s*["']?status/,'live status messages are not pills');
  assert.doesNotMatch(css,/(?:^|,)\s*\.status\b/,'the public-site status panel is not a pill');
  assert.match(footprint.selector,/:is\(span,\s*em,\s*i,\s*b,\s*strong,\s*small\)/);
  assert.match(footprint.selector,/:not\(\[role="button"\]\):not\(\[role="switch"\]\)/);
  assert.doesNotMatch(css,/:disabled|aria-checked|pointer-events\s*:|cursor\s*:|opacity\s*:|filter\s*:/);
  for(const excluded of ['.task-switch','.sale-toggle','.auto-renew-switch','.renewal-status-filters','.request-status-pending','.status-dot,']){
    assert.ok(!footprint.selector.includes(excluded),`must not size control/container ${excluded}`);
  }
});

test('覆盖订单、服务、工单、客户、通知、备份状态及外置详情徽标',()=>{
  const named=[
    'console-status-badge','order-status','ops-status','renewal-status','aftersales-status',
    'record-status','customer-order-status','service-request-status','service-proxy-status',
    'node-order-status','expired-service-badge','addon-service-state','notify-status',
    'ticket-status','admin-state','server-badge','vops-status','bkp-copy-status',
    'update-history-status','script-state','wifi-name-duplicate-badge'
  ];
  for(const className of named)assert.ok(footprint.selector.includes(`.${className}`),`missing ${className}`);
  for(const selector of [
    '.customer-row:not(.head) > span > em:is(.active, .suspended)',
    '.service-billing-cell > em','.credit-row:not(.head) > em',
    '.credit-bills > div:not(.head) > em','.channel-list > article > em',
    '.product-type-list > article > em','.vps-card > header > span:is(.on, .off)',
    '.scheduled-master > span','.node-credential-setting > .setting-title > span',
    '.credit-statement-main > span > em',
    '.credit-statement-details > div:not(.head) > em','.customer-ticket-list > button > em',
    '.standalone-table > .srow:not(.head) > span:nth-child(5)',
    '.coupon-table > .crow:not(.head) > span:nth-child(8)',
    '.proxy-row:not(.head) > span:has(> .status-dot)'
  ])assert.ok(footprint.selector.includes(selector),`missing legacy badge field ${selector}`);
  assert.match(footprint.selector,/:is\(span, em, i, b, strong, small\):is\(\s*\[data-ui="status"\],\s*\.console-status-badge,\s*\.order-status/,'explicit pill classes work in modal portals without a console ancestor');
});

test('共享尺寸层保留原来的语义颜色，仅为旧版绿点状态补齐绿色表面',()=>{
  assert.doesNotMatch(footprint.body,/(?:^|[;{])\s*(?:background(?:-color)?|color|border-color)\s*:/);
  const colorRules=rules.filter(rule=>/(?:^|;)\s*(?:background|color)\s*:/.test(rule.body));
  assert.equal(colorRules.length,1);
  assert.equal(colorRules[0].selector,'.unified-console .proxy-row:not(.head) > span:has(> .status-dot)');
  assert.equal(declaration(colorRules[0].body,'background'),'#ecfdf5');
  assert.equal(declaration(colorRules[0].body,'color'),'#047857');
});

test('共享主题在旧页面和移动样式之后载入，状态尺寸层是最后一项 CSS',()=>{
  const imports=[...layout.matchAll(/^import\s+["']([^"']+\.css)["']\s*;?/gm)].map(([,path])=>path);
  assert.deepEqual(imports.slice(-3),['./console-visual-system.css','./control-visual-system.css','./console-status-system.css']);
  assert.ok(imports.indexOf('./mobile-responsive.css')<imports.indexOf('./console-visual-system.css'));
  assert.ok(JSON.parse(packageSource).scripts.test.includes('tests/console-visual-system.test.mjs'));
});

test('两个控制台保留各自作用域，共用线性图标并在新概览使用统一状态徽标',()=>{
  for(const [source,scope] of [[adminShell,'admin-pro'],[customerShell,'unified-console']]){
    const mainTags=source.match(/<main\b[^>]*>/g)||[];
    assert.ok(mainTags.some(tag=>tag.includes(scope)),`missing console shell ${scope}`);
    assert.match(source,/import\s+ConsoleOverview\b/);
    assert.match(source,/<ConsoleOverview\b/);
  }
  for(const source of [adminShell,customerShell,adminOverview,customerOverview]){
    assert.match(source,/import\s+ConsoleIcon\b[^;]*from\s+["']\.\.\/components\/ConsoleIcon["']/);
    assert.match(source,/<ConsoleIcon\b/);
  }
  for(const source of [adminOverview,customerOverview]){
    const statusTags=source.match(/<span\b[^>]*>/g)||[];
    assert.ok(statusTags.some(tag=>tag.includes('console-status-badge')),'overview status must use the shared badge class');
  }
  assert.match(iconSource,/export\s+default\s+function\s+ConsoleIcon\b/);
  assert.match(iconSource,/<svg\b/);
  assert.match(iconSource,/fill=["']none["']/);
  assert.match(iconSource,/stroke=["']currentColor["']/);
  assert.match(iconSource,/aria-hidden=["']true["']/);
  assert.match(iconSource,/focusable=["']false["']/);
});

test('共享主题保持白色侧栏与中性 #e6e7eb 工作区，不重新引入有色侧栏',()=>{
  const root=themeRule(':is(.admin-pro,.unified-console)');
  assert.ok(root);
  assert.equal(declaration(root.body,'--cv-canvas'),'#e6e7eb');
  assert.equal(declaration(root.body,'--cv-surface'),'#fff');
  assert.equal(declaration(root.body,'background'),'var(--cv-canvas)');
  assert.equal(declaration(root.body,'color-scheme'),'light');
  const sidebar=themeRule('.admin-pro>aside,.unified-console>.console-side');
  assert.ok(sidebar);
  assert.equal(compact(declaration(sidebar.body,'background')),'#fff!important');
  const work=themeRule('.admin-pro .admin-work,.unified-console .console-body');
  assert.equal(declaration(work.body,'background'),'var(--cv-canvas)');
});

test('手机端保留可展开的侧栏抽屉，两端展开状态都能恢复显示',()=>{
  assert.match(theme,/@media\s*\(\s*max-width\s*:\s*760px\s*\)/);
  const drawers=themeRules.filter(rule=>compact(rule.selector)==='.admin-pro>aside,.unified-console>.console-side');
  const mobileDrawer=drawers.find(rule=>declaration(rule.body,'position')==='fixed');
  assert.ok(mobileDrawer,'mobile navigation must be a real fixed drawer');
  assert.equal(declaration(mobileDrawer.body,'display'),'flex');
  assert.equal(declaration(mobileDrawer.body,'transform'),'translateX(-105%)');
  assert.equal(declaration(mobileDrawer.body,'visibility'),'hidden','a translated drawer alone still accepts keyboard focus');
  assert.equal(declaration(mobileDrawer.body,'pointer-events'),'none');
  const open=themeRule('.admin-pro.mobile-nav-open>aside,.unified-console.mobile-nav-open>.console-side');
  assert.ok(open);
  assert.equal(declaration(open.body,'transform'),'translateX(0)');
  assert.equal(declaration(open.body,'visibility'),'visible');
  assert.notEqual(declaration(open.body,'display'),'none');
  for(const source of [adminShell,customerShell]){
    assert.ok(source.includes('mobile-nav-open'));
    assert.match(source,/aria-expanded=\{mobileMenuOpen\}/);
    assert.match(source,/useConsoleMobileMenu\(/);
    assert.match(source,/inert=\{mobileMenuOpen\}/);
  }
  assert.match(mobileMenu,/event\.key === "Escape"/);
  assert.match(mobileMenu,/closeRef\.current\?\.focus/);
  assert.match(mobileMenu,/trigger\.focus/);
});

test('侧栏搜索保留可见焦点，手机文字输入不被全局 13px 字号覆盖',()=>{
  const focus=themeRule('.unified-console .console-sidebar-search:focus-within,.admin-pro .console-menu-search:focus-within');
  assert.equal(declaration(focus.body,'outline'),'2px solid var(--cv-blue)');
  assert.match(theme,/@media\(max-width:760px\)[\s\S]*?\.admin-pro \.console-menu-search input,\.unified-console \.console-service-search input\{font-size:16px!important\}/);
});

test('根主题不为所有输入框和下拉框强制统一固定宽度',()=>{
  const globalFields=themeRules.filter(rule=>{
    const selector=compact(rule.selector);
    return selector.startsWith(':is(.admin-pro,.unified-console):where(')&&/\b(?:input|select|textarea)\b/.test(selector);
  });
  assert.ok(globalFields.length,'shared field rules must remain discoverable');
  for(const rule of globalFields){
    for(const property of ['width','min-width','max-width','inline-size','min-inline-size','max-inline-size']){
      const value=declaration(rule.body,property);
      if(value)assert.doesNotMatch(value,/\b\d+(?:\.\d+)?(?:px|rem|em|ch)\b/,`${property} should be owned by the specific field/layout`);
    }
  }
});
