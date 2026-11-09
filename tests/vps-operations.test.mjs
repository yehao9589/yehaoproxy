import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createXPanelBridge} from '../scripts/xpanel-bridge.mjs';
import {VpsOperations} from '../scripts/vps/operations.mjs';
import {vpsBackupFileName,vpsBackupContentDisposition} from '../scripts/vps/backup-name.mjs';
import {normalizeVpsBackupSchedule,nextVpsBackupAt,updateVpsBackupPlan} from '../lib/vps-backup-plan.ts';

const database=Buffer.alloc(4096);database.write('SQLite format 3\0');database.writeUInt16BE(4096,16);
async function fixture(t){
  const root=fileURLToPath(new URL('../.vps-test-data/',import.meta.url));await fs.mkdir(root,{recursive:true});
  const directory=await fs.mkdtemp(path.join(root,'case-'));
  const state={requests:[],badLogin:false,expired:false,badDb:'',configFails:false,delay:0,status:{cpu:16,mem:{current:512,total:1024},xray:{state:'running'}}};
  const remote=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    state.requests.push({path:req.url,cookie:req.headers.cookie,ajax:req.headers['x-requested-with'],body});
    const json=(status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(data));};
    if(req.url==='/secret/login')return json(200,{success:!state.badLogin},{'set-cookie':'3x-ui=accepted; Path=/secret/; HttpOnly'});
    if(!req.headers.cookie?.includes('3x-ui=accepted')||state.expired){state.expired=false;return json(401,{success:false});}
    if(req.url.endsWith('/inbounds/list'))return json(200,{success:true,obj:[{id:1,up:100,down:200}]});
    if(req.url.endsWith('/server/status'))return json(200,{success:true,obj:state.status});
    if(req.url.endsWith('/getConfigJson'))return json(state.configFails?500:200,{success:!state.configFails,obj:{inbounds:[],outbounds:[{protocol:'freedom'}]}});
    if(req.url.endsWith('/getDb')){
      if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
      res.writeHead(200,{'content-type':'application/octet-stream'});
      return res.end(state.badDb==='html'?'<html>login</html>':state.badDb==='json'?'\x7b"success":false\x7d':state.badDb==='truncated'?'SQLite format 3\0':database);
    }
    return json(404,{success:false});
  });
  await new Promise(resolve=>remote.listen(0,'127.0.0.1',resolve));
  const connection={id:'vps-test',name:'模拟面板',baseUrl:`http://127.0.0.1:${remote.address().port}/secret/`,username:'test-user',password:'private-password',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'};
  const bridge=createXPanelBridge({directory,secret:'test-bridge-secret',allowHttp:true,timeout:1000});
  const address=await bridge.listen(0,'127.0.0.1'),origin=`http://127.0.0.1:${address.port}`;
  async function request(route,body={},secret='test-bridge-secret'){
    return fetch(origin+route,{method:'POST',headers:{'content-type':'application/json','x-bridge-secret':secret},body:JSON.stringify(body)});
  }
  async function backup(options={}){const response=await request('/operations/backup',{server:connection,retain:1,trigger:'manual',...options});assert.equal(response.status,202,await response.clone().text());await bridge.operations.idle();return bridge.operations.snapshot();}
  t.after(async()=>{await bridge.close();await new Promise(resolve=>{remote.close(resolve);remote.closeAllConnections();});const absolute=path.resolve(directory);assert.ok(absolute.startsWith(path.resolve(root)+path.sep));await fs.rm(absolute,{recursive:true,force:true});});
  return {state,connection,bridge,request,backup,origin,directory};
}

test('连接桥复用旧入站接口，鉴权、自定义路径、TOTP 与状态缓存正常',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/operations/state',{},'wrong')).status,401);
  const rows=await f.request('/inbounds',f.connection);assert.equal(rows.status,200);assert.equal((await rows.json()).rows[0].down,200);
  assert.equal((await f.request('/operations/check',{server:f.connection})).status,202);await f.bridge.operations.idle();
  assert.equal(f.bridge.operations.snapshot().statuses['vps-test'].metrics.cpu,16);
  const login=f.state.requests.find(request=>request.path.endsWith('/login'));
  assert.match(new URLSearchParams(login.body).get('twoFactorCode'),/^\d{6}$/);
  for(const request of f.state.requests){assert.ok(request.path.startsWith('/secret/'));assert.equal(request.ajax,'XMLHttpRequest');}
  f.state.status=null;f.state.expired=true;await f.request('/operations/check',{server:f.connection});await f.bridge.operations.idle();
  assert.equal(f.bridge.operations.snapshot().statuses['vps-test'].online,true);
  assert.equal(f.bridge.operations.snapshot().statuses['vps-test'].metrics,null);
});
test('有效数据库和配置流式下载，HEAD 不读取响应体，凭据不会落入运维索引',async t=>{
  const f=await fixture(t),state=await f.backup(),backup=state.backups[0];
  assert.equal(backup.sha256,createHash('sha256').update(database).digest('hex'));assert.equal(backup.hasConfig,true);
  assert.equal(state.jobs[0].status,'success');
  const response=await f.request('/operations/download',{backupId:backup.id,kind:'db'});assert.deepEqual(Buffer.from(await response.arrayBuffer()),database);
  const disposition=response.headers.get('content-disposition');assert.match(disposition,/filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]),vpsBackupFileName(backup));
  assert.equal(path.basename(f.bridge.operations.download(backup.id).filename),backup.id+'.db');
  const head=await fetch(`${f.origin}/operations/download?backupId=${backup.id}&kind=db`,{method:'HEAD',headers:{'x-bridge-secret':'test-bridge-secret'}});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'4096');assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal(head.headers.get('content-disposition'),disposition);
  const config=await f.request('/operations/download',{backupId:backup.id,kind:'config'});assert.deepEqual(await config.json(),{inbounds:[],outbounds:[{protocol:'freedom'}]});
  assert.equal(decodeURIComponent(config.headers.get('content-disposition').split("filename*=UTF-8''")[1]),vpsBackupFileName(backup,'config'));
  const index=await fs.readFile(path.join(f.directory,'index.json'),'utf8');assert.ok(!index.includes('private-password'));assert.ok(!index.includes(f.connection.totpSecret));assert.ok(!index.includes('3x-ui='));
});
test('坏备份不清理旧文件，成功后执行保留策略，配置失败仍保留数据库',async t=>{
  const f=await fixture(t),first=(await f.backup()).backups[0];
  for(const badDb of ['html','json','truncated']){f.state.badDb=badDb;const state=await f.backup();assert.equal(state.backups[0].id,first.id);assert.equal(state.jobs[0].status,'error');}
  f.state.badDb='';f.state.configFails=true;const state=await f.backup();assert.equal(state.backups.length,1);assert.notEqual(state.backups[0].id,first.id);assert.equal(state.backups[0].hasConfig,false);assert.match(state.backups[0].warning,/配置导出失败/);
  assert.equal((await f.request('/operations/download',{backupId:first.id})).status,404);
});
test('单面板备份互斥，重复调度标识只执行一次，重启保留文件并标记中断任务',async t=>{
  const f=await fixture(t);f.state.delay=70;
  assert.equal((await f.request('/operations/backup',{server:f.connection,retain:7,trigger:'manual'})).status,202);
  assert.equal((await f.request('/operations/backup',{server:f.connection,retain:7,trigger:'manual'})).status,409);
  await f.bridge.operations.idle();
  const scheduled={server:f.connection,retain:7,trigger:'schedule',dueToken:'2026-10-30T19:00:00.000Z'};
  assert.equal((await f.request('/operations/backup',scheduled)).status,202);
  assert.equal((await (await f.request('/operations/backup',scheduled)).json()).alreadyQueued,true);
  await f.bridge.operations.idle();assert.equal(f.bridge.operations.snapshot().backups.length,2);
  f.bridge.operations.change(state=>state.jobs.unshift({id:'interrupted',serverId:'vps-test',status:'running'}));
  const restored=new VpsOperations({directory:f.directory,allowHttp:true});assert.equal(restored.snapshot().jobs[0].status,'error');assert.equal(restored.snapshot().backups.length,2);
  assert.equal((await f.request('/operations/delete-backup',{backupId:restored.snapshot().backups[0].id})).status,200);
});
test('登录返回 HTTP200 但 success=false 时不能误判在线，生产连接要求 HTTPS',async t=>{
  const f=await fixture(t);f.state.badLogin=true;await f.request('/operations/check',{server:f.connection});await f.bridge.operations.idle();assert.equal(f.bridge.operations.snapshot().statuses['vps-test'].online,false);
  const prod=new VpsOperations({directory:path.join(f.directory,'prod')});assert.throws(()=>prod.check(f.connection),/HTTPS/);
  assert.throws(()=>prod.download('../index','db'),/不存在/);
});
test('北京时间计划、间隔计划和保留数修改不会重置执行时间',()=>{
  const now=Date.parse('2026-10-30T18:59:00Z'),daily=normalizeVpsBackupSchedule({enabled:true,kind:'daily',time:'03:00'});
  assert.equal(nextVpsBackupAt(daily,now),'2026-10-30T19:00:00.000Z');
  const previous=updateVpsBackupPlan('vps-test',daily,undefined,now);
  assert.equal(updateVpsBackupPlan('vps-test',{...daily,retain:20},previous,now+1000).nextBackupAt,previous.nextBackupAt);
  assert.equal(nextVpsBackupAt({...daily,kind:'interval',hours:6},now),new Date(now+6*3600000).toISOString());
  assert.equal(nextVpsBackupAt({...daily,enabled:false},now),null);
  assert.throws(()=>normalizeVpsBackupSchedule(null),/格式/);assert.throws(()=>normalizeVpsBackupSchedule({time:'25:00'}),/HH:mm/);assert.throws(()=>normalizeVpsBackupSchedule({retain:0}),/1–100/);
});
test('配置副本落盘失败时保留已经校验通过的数据库',async t=>{
  const f=await fixture(t),write=syncFs.writeFileSync;
  syncFs.writeFileSync=function(file,...args){if(typeof file==='string'&&file.startsWith(path.join(f.directory,'files'))&&file.endsWith('.json'))throw new Error('simulated configuration disk failure');return write.call(this,file,...args);};
  try{const state=await f.backup();assert.equal(state.backups.length,1);assert.equal(state.backups[0].hasConfig,false);assert.match(state.backups[0].warning,/配置副本写入失败/);assert.equal(state.jobs[0].status,'success');assert.equal((await f.request('/operations/download',{backupId:state.backups[0].id})).status,200);}finally{syncFs.writeFileSync=write;}
});
test('迁移后的 VPS 菜单、分页、开关与刷新复用主系统',async()=>{
  const read=file=>fs.readFile(fileURLToPath(new URL('../'+file,import.meta.url)),'utf8');
  const [shell,routes,client,datepicker,backend,workspace]=await Promise.all(['app/admin/LiveAdmin.tsx','app/admin/AdminRoutePersistence.tsx','app/admin/vps/VpsOperations.tsx','app/DatePickerLayer.tsx','lib/vps-operations.ts','app/admin/vps/VpsBackupWorkspace.tsx'].map(read));
  for(const tab of ['vps-overview','vps-monitor','vps-backups','vps-jobs']){assert.ok(shell.includes(tab));assert.ok(routes.includes(tab));}
  assert.match(shell,/id:\s*"vps",\s*label:\s*"VPS 运维"/);assert.match(client,/usePageSize\(\)/);assert.match(client,/<Pagination/);assert.match(client,/<AdminRefreshButton/);
  assert.match(client,/role="switch" aria-label="启用自动备份"/);assert.doesNotMatch(client,/type="checkbox"/);assert.match(client,/yehao:toast/);
  assert.match(datepicker,/target.closest\("dialog\[open\]"\)\|\|document.body/);
  assert.match(backend,/action==="download"&&!head\?600000:20000/);assert.doesNotMatch(backend,/cycleBaselineBytes|resetServiceTraffic/);
  assert.match(client,/anchor.download=vpsBackupFileName\(backup,kind\)/);assert.match(workspace,/title=\{vpsBackupFileName\(backup\)\}/);
});
test('备份文件名包含面板名称、北京时间与文件类型，跨日和零点正确',()=>{
  const backup={id:'legacy-backup-id',serverName:'君山电脑节点',createdAt:'2026-10-30T18:30:05.000Z'};
  assert.equal(vpsBackupFileName(backup),'君山电脑节点_2026-10-31_02-30-05_数据库.db');
  assert.equal(vpsBackupFileName(backup,'config'),'君山电脑节点_2026-10-31_02-30-05_Xray配置.json');
  assert.equal(vpsBackupFileName({...backup,createdAt:'2026-10-30T16:00:00Z'}),'君山电脑节点_2026-10-31_00-00-00_数据库.db');
});
test('中文下载名安全编码，非法路径字符、控制字符、超长名称及旧记录兼容',()=>{
  const backup={id:'old-id',serverName:'../香港/面板\\A:*?"<>|\r\n\u202e',createdAt:'2026-10-31T01:02:03Z'};
  const name=vpsBackupFileName(backup),header=vpsBackupContentDisposition(backup);
  assert.ok(!/[<>:"/\\|?*]/.test(name));assert.ok(!/[\p{Cc}\p{Cf}]/u.test(name));assert.ok(!name.startsWith('.'));
  assert.ok([...header].every(char=>char.charCodeAt(0)>=32&&char.charCodeAt(0)<=126));
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]),name);
  assert.ok(Buffer.byteLength(vpsBackupFileName({...backup,serverName:'面板'.repeat(100)}))<255);
  assert.match(vpsBackupFileName({...backup,serverName:'CON'}),/^面板_CON_/);
  assert.equal(vpsBackupFileName({}),'X-Panel_未知时间_数据库.db');
  assert.throws(()=>vpsBackupFileName(backup,'invalid'),/下载类型/);
});
