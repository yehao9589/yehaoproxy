import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createHmac} from 'node:crypto';
import {VpsOperations} from '../scripts/vps/operations.mjs';
import {r2Destination,R2BackupClient,signedR2Request} from '../scripts/vps/r2-client.mjs';
import {createEncryptedArchive,archiveKeyId} from '../scripts/vps/encrypted-archive.mjs';
import {decryptArchive} from '../public/tools/yehaoproxy-decrypt-backup.mjs';
import {vpsBackupFileName} from '../scripts/vps/backup-name.mjs';
import {getR2SetupState} from '../lib/vps-r2-setup.ts';
import {filterVpsBackups,isCurrentR2Copy,r2UploadReason,backupDate} from '../lib/vps-backup-view.ts';

const key='ab'.repeat(32),cloud={accountId:'a'.repeat(32),bucket:'yehao-backups',prefix:'yehaoproxy/vps',jurisdiction:'default',accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),encryptionKey:key};
const database=Buffer.alloc(4096);database.write('SQLite format 3\0');database.write('private-user-and-node-credentials',100);
const hash=value=>createHash('sha256').update(value).digest('hex');

test('R2 启用指引明确区分缺少解密密钥、未保存启用及实际启用，开关始终关联可见原因',async()=>{
  const empty={enabled:false,accessKeyConfigured:false,secretConfigured:false,encryptionKeyConfigured:false,keyExportedAt:null};
  assert.match(getR2SetupState(empty).title,/暂不能启用.*先下载/);
  const credentials={...empty,accessKeyConfigured:true,secretConfigured:true};
  assert.deepEqual(getR2SetupState(credentials).steps.map(step=>step.complete),[true,false,false]);
  assert.equal(getR2SetupState({...credentials,keyExportedAt:'2026-11-03'}).keyReady,false);
  const ready={...credentials,encryptionKeyConfigured:true,keyExportedAt:'2026-11-03'};
  assert.match(getR2SetupState(ready).title,/准备已完成/);
  const pending=getR2SetupState(ready,true,true);
  assert.match(pending.title,/尚未保存/);assert.match(pending.switchHelp,/尚未生效/);assert.equal(pending.saveLabel,'保存并启用 R2');assert.equal(pending.steps[2].complete,false);
  const enabled={...ready,enabled:true};
  assert.equal(getR2SetupState(enabled).tone,'success');assert.ok(getR2SetupState(enabled).steps.every(step=>step.complete));
  assert.match(getR2SetupState(enabled,false,true).switchHelp,/关闭操作尚未保存/);
  assert.match(getR2SetupState(enabled,true,true).description,/保存 R2 设置/);
  assert.match(getR2SetupState({...ready,secretConfigured:false}).title,/填写并保存 R2 访问配置/);
  const ui=await fs.readFile(new URL('../app/admin/vps/VpsR2Settings.tsx',import.meta.url),'utf8');
  assert.match(ui,/aria-describedby="r2-enable-help"/);assert.match(ui,/id="r2-enable-help"/);assert.match(ui,/先下载解密密钥/);assert.match(ui,/disabled=\{!!busy\|\|\(!setup.keyReady&&!form.enabled\)\}/);
  const workspace=await fs.readFile(new URL('../app/admin/vps/VpsBackupWorkspace.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(workspace,/data.cloud\?\.enabled&&<button/);
  assert.match(workspace,/disabled=\{!!reason\}/);assert.match(workspace,/R2 尚未启用，上传按钮暂不可用/);
});

test('备份工作区筛选、排序和上传目标判断不改变原始数据，详情与 R2 设置保留独立滚动和固定操作区',async()=>{
  const first={id:'one',serverId:'removed',serverName:'英国节点',createdAt:'2026-11-02T18:00:00Z',bytes:100,sha256:'sha-first',hasConfig:true};
  const second={...first,id:'two',serverId:'active',serverName:'美国节点',createdAt:'2026-11-03T18:00:00Z',cloud:{...cloud,status:'success',keyId:'key-1'}};
  const third={...second,id:'three',createdAt:'2026-11-04T00:00:00Z',cloud:{status:'error'}};
  const source=[first,second,third],snapshot=JSON.stringify(source),filters={query:'',serverId:'',status:''};
  assert.deepEqual(filterVpsBackups(source,filters).map(item=>item.id),['three','two','one']);
  assert.deepEqual(filterVpsBackups(source,{...filters,serverId:'removed'}).map(item=>item.id),['one']);
  assert.deepEqual(filterVpsBackups(source,{...filters,query:'SHA-FIRST',status:'local'}).map(item=>item.id),['one']);
  assert.deepEqual(filterVpsBackups(source,{...filters,query:'英国节点_2026-11-03',status:'local'}).map(item=>item.id),['one']);
  assert.deepEqual(filterVpsBackups(source,{...filters,status:'error'}).map(item=>item.id),['three']);
  assert.deepEqual(filterVpsBackups(source,{...filters,status:'success'}).map(item=>item.id),['two']);assert.equal(JSON.stringify(source),snapshot);
  const settings={...cloud,enabled:true,keyId:'key-1'};
  assert.equal(isCurrentR2Copy(second,settings),true);assert.equal(isCurrentR2Copy(second,{...settings,bucket:'another-bucket'}),false);assert.equal(isCurrentR2Copy(second,{...settings,keyId:'new-key'}),false);
  assert.match(r2UploadReason(first,{...settings,enabled:false}),/尚未启用/);assert.match(r2UploadReason(second,settings),/无需重复/);assert.equal(r2UploadReason(third,settings),'');
  assert.match(r2UploadReason({...first,cloud:{status:'uploading'}},settings),/正在加密上传/);assert.match(r2UploadReason(first,settings,'bridge unavailable'),/连接桥不可用/);
  assert.equal(backupDate('2026-11-03T18:00:00Z','date'),'2026/11/04');assert.equal(backupDate('invalid'),'—');
  const workspace=await fs.readFile(new URL('../app/admin/vps/VpsBackupWorkspace.tsx',import.meta.url),'utf8'),css=await fs.readFile(new URL('../app/admin/vps/vps-backup-workspace.css',import.meta.url),'utf8');
  for(const label of ['备份文件列表','自动备份计划列表','备份任务列表','R2 异地备份设置','关闭备份详情','关闭 R2 设置','关闭新建备份'])assert.ok(workspace.includes(label));
  assert.match(workspace,/settingsDialog.current\?\.showModal\(\)/);assert.match(workspace,/data.cloud&&<VpsR2Settings/);assert.match(workspace,/onRun\("delete-backup"/);assert.match(workspace,/if\(!confirm\(/);
  assert.match(css,/\.bkp-drawer \.vops-r2-form-body\{[^}]*overflow-y:auto/);assert.match(css,/\.bkp-drawer \.vops-r2-settings form>footer\{flex-shrink:0/);assert.match(css,/grid-template-areas:"number file"/);
  assert.match(css,/width:min\(730px,100%\)/);assert.match(css,/\.bkp-workspace \.bkp-dialog-footer\{[^}]*padding:16px 24px/);
});
function cloudMock(){
  const objects=new Map(),requests=[],state={fail:false,badHead:false,delay:null};
  async function fetchImpl(url,init){
    requests.push({url,method:init.method,headers:init.headers});
    assert.match(url,new RegExp('^https://'+cloud.accountId+'\\.r2\\.cloudflarestorage\\.com/'));
    assert.equal(init.redirect,'manual');assert.match(init.headers.authorization,/AWS4-HMAC-SHA256/);
    if(state.fail)return new Response('must not disclose provider error or credentials',{status:403});
    const pathname=new URL(url).pathname;
    if(init.method==='HEAD'&&pathname==='/'+cloud.bucket)return new Response(null,{status:200});
    if(init.method==='PUT'){
      if(state.delay)await state.delay;
      assert.equal(init.headers['if-none-match'],'*');assert.equal(init.headers['x-amz-storage-class'],'STANDARD');
      const parts=[];for await(const part of init.body)parts.push(Buffer.from(part));const bytes=Buffer.concat(parts);
      assert.equal(bytes.length,Number(init.headers['content-length']));assert.equal(hash(bytes),init.headers['x-amz-content-sha256']);
      assert.equal(createHash('md5').update(bytes).digest('base64'),init.headers['content-md5']);
      if(objects.has(pathname))return new Response(null,{status:412});
      objects.set(pathname,{bytes,sha256:init.headers['x-amz-meta-sha256']});return new Response(null,{status:200});
    }
    if(init.method==='HEAD'){const item=objects.get(pathname);return new Response(null,{status:item?200:404,headers:item?{'content-length':String(item.bytes.length),'x-amz-meta-sha256':state.badHead?'bad':item.sha256}:{}});}
    throw new Error('unexpected cloud operation');
  }
  return{objects,requests,state,fetchImpl};
}
async function fixture(t){
  const root=fileURLToPath(new URL('../.vps-test-data/',import.meta.url));await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'r2-'));
  const remote=cloudMock(),clock={value:Date.parse('2026-11-03T00:00:00Z')};
  const fetchImpl=async url=>{
    url=String(url);
    if(url.endsWith('/login'))return new Response(JSON.stringify({success:true}),{headers:{'set-cookie':'panel-session=accepted; Path=/secret/'}});
    if(url.endsWith('/getDb'))return new Response(database);
    if(url.endsWith('/getConfigJson'))return new Response(JSON.stringify({success:true,obj:{inbounds:[{id:'private-config-value'}],outbounds:[]}}));
    throw new Error('unexpected panel operation');
  };
  const operations=new VpsOperations({directory,fetchImpl,cloudFetchImpl:remote.fetchImpl,now:()=>clock.value});
  const connection={id:'vps-r2-test',name:'英国电脑节点',baseUrl:'https://example.test/secret/',username:'panel-user',password:'panel-private-password'};
  t.after(async()=>{await operations.idle();const absolute=path.resolve(directory);assert.ok(absolute.startsWith(path.resolve(root)+path.sep));await fs.rm(absolute,{recursive:true,force:true});});
  return{directory,operations,remote,clock,connection};
}

test('R2 目标只允许官方 HTTPS 端点，签名正确编码中文路径且使用 auto 区域',()=>{
  assert.deepEqual(r2Destination(cloud),{accountId:cloud.accountId,bucket:cloud.bucket,prefix:cloud.prefix,jurisdiction:'default'});
  for(const invalid of [{accountId:'https://evil.test'},{bucket:'../bucket'},{prefix:'../private'},{jurisdiction:'evil.test'}])assert.throws(()=>r2Destination({...cloud,...invalid}));
  const now=new Date('2026-11-03T01:02:03Z'),signed=signedR2Request(cloud,'HEAD','目录/英国 01.yhbackup',undefined,{},now);
  assert.ok(signed.url.endsWith('/%E7%9B%AE%E5%BD%95/%E8%8B%B1%E5%9B%BD%2001.yhbackup'));
  assert.equal(signed.headers['x-amz-date'],'20261103T010203Z');assert.match(signed.headers.authorization,/20261103\/auto\/s3\/aws4_request/);
  // Independently assemble the canonical request and key derivation.
  const names=['host','x-amz-content-sha256','x-amz-date'];
  const canonical=['HEAD',new URL(signed.url).pathname,'',names.map(name=>`${name}:${signed.headers[name]}\n`).join(''),names.join(';'),hash('')].join('\n');
  const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
  const derived=['20261103','auto','s3','aws4_request'].reduce((key,part)=>hmac(key,part),Buffer.from('AWS4'+cloud.secretAccessKey));
  const expected=hmac(derived,['AWS4-HMAC-SHA256',signed.headers['x-amz-date'],'20261103/auto/s3/aws4_request',hash(canonical)].join('\n')).toString('hex');
  assert.ok(signed.headers.authorization.endsWith('Signature='+expected));
  assert.match(signedR2Request({...cloud,jurisdiction:'eu'},'HEAD').url,/\.eu\.r2\.cloudflarestorage\.com/);
});

test('加密归档能独立解密，密钥错误或文件被篡改时不产生可用输出，不覆盖已有目录',async t=>{
  const f=await fixture(t);f.operations.backup(f.connection);await f.operations.idle();const backup=f.operations.state.backups[0];
  const files=[{filename:f.operations.download(backup.id).filename,kind:'db'},{filename:f.operations.download(backup.id,'config').filename,kind:'config'}];
  const filename=path.join(f.directory,'archive.yhbackup'),archive=await createEncryptedArchive(backup,files,key,filename),bytes=await fs.readFile(filename);
  assert.equal(archive.keyId,archiveKeyId(key));assert.ok(!bytes.includes(Buffer.from('private-user-and-node-credentials')));assert.ok(!bytes.includes(Buffer.from('private-config-value')));
  const recovery={format:'YehaoProxy-R2-Recovery-Key',encryptionKey:key},output=path.join(f.directory,'decrypted');
  const result=await decryptArchive(filename,recovery,output);assert.equal(result.files.length,2);assert.deepEqual(await fs.readFile(path.join(output,vpsBackupFileName(backup))),database);
  assert.match(await fs.readFile(path.join(output,vpsBackupFileName(backup,'config')),'utf8'),/private-config-value/);
  await assert.rejects(decryptArchive(filename,recovery,output),/输出目录已存在/);
  await assert.rejects(decryptArchive(filename,{...recovery,encryptionKey:'cd'.repeat(32)},path.join(f.directory,'wrong-key')),/不匹配/);
  bytes[bytes.length-1]^=1;const bad=path.join(f.directory,'bad.yhbackup');await fs.writeFile(bad,bytes);await assert.rejects(decryptArchive(bad,recovery,path.join(f.directory,'tampered')));
  assert.equal(syncFs.existsSync(path.join(f.directory,'wrong-key')),false);assert.equal(syncFs.existsSync(path.join(f.directory,'tampered')),false);
  const second=path.join(f.directory,'second.yhbackup');await createEncryptedArchive(backup,files,key,second);assert.notDeepEqual(await fs.readFile(second),await fs.readFile(filename));
});

test('检测 R2 只发 HEAD；未开启时备份不上传；开启后上传加密数据并核对对象，凭据不进入索引',async t=>{
  const f=await fixture(t),client=new R2BackupClient(cloud,{fetchImpl:f.remote.fetchImpl});await client.test();assert.deepEqual(f.remote.requests.map(request=>request.method),['HEAD']);
  f.operations.backup(f.connection);await f.operations.idle();assert.equal(f.remote.objects.size,0);
  f.clock.value+=1000;f.operations.backup(f.connection,{cloud});await f.operations.idle();
  const backup=f.operations.snapshot().backups[0];assert.equal(backup.cloud.status,'success');assert.equal(f.remote.objects.size,1);assert.equal(f.operations.snapshot().jobs[0].kind,'cloud-upload');
  assert.equal(f.operations.upload(backup.id,cloud).queued,false);
  const index=await fs.readFile(path.join(f.directory,'index.json'),'utf8');for(const secret of [cloud.accessKeyId,cloud.secretAccessKey,key,f.connection.password])assert.ok(!index.includes(secret));
  const object=[...f.remote.objects.values()][0],archive=path.join(f.directory,'downloaded.yhbackup');await fs.writeFile(archive,object.bytes);
  await decryptArchive(archive,{format:'YehaoProxy-R2-Recovery-Key',encryptionKey:key},path.join(f.directory,'cloud-recovered'));
  assert.deepEqual(await fs.readFile(path.join(f.directory,'cloud-recovered',vpsBackupFileName(backup))),database);
});

test('R2 故障或无效配置保留本地备份，自动重试退避且有上限；校验失败不会显示成功',async t=>{
  const f=await fixture(t);f.remote.state.fail=true;f.operations.backup(f.connection,{cloud});await f.operations.idle();
  let backup=f.operations.snapshot().backups[0];assert.equal(backup.cloud.status,'error');assert.equal(f.operations.download(backup.id).bytes,database.length);
  assert.ok(!backup.cloud.error.includes('must not disclose'));assert.equal(f.operations.retryCloud(cloud).queued,0);
  f.clock.value+=300001;f.remote.state.fail=false;assert.equal(f.operations.retryCloud(cloud).queued,1);await f.operations.idle();assert.equal(f.operations.snapshot().backups[0].cloud.status,'success');
  f.operations.change(state=>{state.backups[0].cloud={...state.backups[0].cloud,status:'error',attempts:5,retryAfter:new Date(f.clock.value-1).toISOString()};});assert.equal(f.operations.retryCloud(cloud).queued,0);
  f.clock.value+=1000;f.remote.state.badHead=true;f.operations.backup(f.connection,{cloud});await f.operations.idle();backup=f.operations.snapshot().backups[0];assert.equal(backup.cloud.status,'error');assert.match(backup.cloud.error,/校验信息不一致/);assert.equal(f.operations.download(backup.id).bytes,database.length);
  f.clock.value+=1000;f.operations.backup(f.connection,{cloud:{configurationError:true}});await f.operations.idle();assert.equal(f.operations.snapshot().backups[0].cloud.status,'error');assert.ok(f.operations.snapshot().backups[0].sha256);
});

test('上传中的本地备份不被清理或删除，本地删除不调用云端删除，重启保留失败状态',async t=>{
  const f=await fixture(t);f.operations.backup(f.connection);await f.operations.idle();const old=f.operations.snapshot().backups[0];
  let release;f.remote.state.delay=new Promise(resolve=>{release=resolve});f.operations.upload(old.id,cloud);
  assert.throws(()=>f.operations.remove(old.id),/正在上传/);
  f.clock.value+=1000;f.operations.backup(f.connection,{retain:1});await new Promise(resolve=>setTimeout(resolve,30));assert.ok(f.operations.state.backups.some(item=>item.id===old.id));
  release();await f.operations.idle();f.operations.prune(f.connection.id,1);assert.equal(f.operations.state.backups.length,1);assert.equal(f.remote.objects.size,1);assert.ok(f.remote.requests.every(request=>request.method!=='DELETE'));
  f.operations.change(state=>{state.backups[0].cloud={status:'uploading',attempts:1};});const restored=new VpsOperations({directory:f.directory,now:()=>f.clock.value});assert.equal(restored.snapshot().backups[0].cloud.status,'error');assert.match(restored.snapshot().backups[0].cloud.error,/重启/);
});

test('本地数据库被修改后禁止上传，解密工具和设置入口随镜像发布，敏感数据不进入审计或公开接口',async t=>{
  const f=await fixture(t);f.operations.backup(f.connection);await f.operations.idle();const backup=f.operations.snapshot().backups[0];await fs.appendFile(f.operations.download(backup.id).filename,'tampered');
  f.operations.upload(backup.id,cloud);await f.operations.idle();assert.equal(f.remote.objects.size,0);assert.match(f.operations.snapshot().backups[0].cloud.error,/校验失败/);
  const read=file=>fs.readFile(new URL('../'+file,import.meta.url),'utf8');
  const [settings,api,ui,operations,bridge,docker]=await Promise.all(['lib/vps-r2.ts','app/api/admin/vps-operations/route.ts','app/admin/vps/VpsR2Settings.tsx','lib/vps-operations.ts','scripts/xpanel-bridge.mjs','Dockerfile'].map(read));
  assert.match(settings,/enabled:false/);assert.match(settings,/encryptedArchiveKey/);assert.match(settings,/encryptCredential\(key\)/);assert.match(settings,/不能自动替换/);assert.match(settings,/启用前请先下载/);
  const publicFunction=settings.slice(settings.indexOf('function publicValue'),settings.indexOf('export type PublicR2'));
  assert.doesNotMatch(publicFunction,/encryptionKey:|secretAccessKey:|accessKeyId:/);
  assert.match(api,/requireAdminApi\("settings"\)/);assert.match(api,/{keyId:recovery.keyId}/);assert.doesNotMatch(api,/audit\([^\n]*body.settings/);
  assert.match(ui,/role="switch" aria-label="启用 R2 异地备份"/);assert.doesNotMatch(ui,/type="checkbox"/);assert.match(ui,/\/tools\/yehaoproxy-decrypt-backup.mjs/);assert.match(operations,/cloud:await cloudForBackup\(\)/);assert.match(operations,/retry-cloud/);
  assert.match(bridge,/operations.testCloud/);assert.match(docker,/COPY --from=build \/app\/public/);
  const css=await read('app/admin/vps/vps-operations.css');
  assert.match(css,/\.vops\.business-page\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css,/\.vops\.business-page>\*\{min-width:0\}/);
  assert.match(css,/\.vops-r2-settings>header>\.vops-status\{white-space:nowrap;flex-shrink:0\}/);
});
