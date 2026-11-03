import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {RemoteClient, normalizeBaseUrl} from './remote.mjs';
import {normalizeTotpSecret} from './totp.mjs';
import {vpsBackupFileName,vpsBackupContentDisposition} from './backup-name.mjs';

export class OperationError extends Error {
  constructor(status,message){super(message);this.status=status;}
}

/** Files and runtime jobs live in the existing backups volume; credentials never do. */
export class VpsOperations {
  constructor(options={}) {
    this.directory=path.resolve(options.directory||process.env.VPS_OPERATIONS_DIR||'/app/backups/vps');
    this.files=path.join(this.directory,'files');
    this.index=path.join(this.directory,'index.json');
    this.now=options.now||Date.now;
    this.options=options;
    this.limit=3;
    this.active=0;
    this.pending=[];
    this.waiters=[];
    this.backups=new Set();
    this.checks=new Set();
    this.clients=new Map();
    fs.mkdirSync(this.files,{recursive:true,mode:0o700});
    this.state=fs.existsSync(this.index)?JSON.parse(fs.readFileSync(this.index,'utf8')):{version:1,statuses:{},backups:[],jobs:[],scheduled:{}};
    if(this.state.version!==1||!Array.isArray(this.state.jobs)||!Array.isArray(this.state.backups)||!this.state.statuses||!this.state.scheduled)throw new Error('VPS 运维索引格式无效，请恢复原索引文件');
    this.change(state=>{
      for(const job of state.jobs)if(job.status==='running'){
        job.status='error';job.finishedAt=this.timestamp();job.message='连接桥重启，上一轮任务中断';
        if(state.scheduled[job.serverId]?.jobId===job.id)delete state.scheduled[job.serverId];
      }
    });
    for(const name of fs.readdirSync(this.files))if(/^[a-f0-9-]+\.tmp$/.test(name))fs.rmSync(path.join(this.files,name),{force:true});
  }
  timestamp(){return new Date(this.now()).toISOString();}
  change(work){
    const state=structuredClone(this.state);
    const result=work(state);
    const temporary=path.join(this.directory,`index-${randomUUID()}.tmp`);
    let file;
    try{
      file=fs.openSync(temporary,'wx',0o600);
      fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n');fs.fsyncSync(file);fs.closeSync(file);file=undefined;
      fs.renameSync(temporary,this.index);this.state=state;
    }catch(error){if(file!==undefined)fs.closeSync(file);fs.rmSync(temporary,{force:true});throw error;}
    return result;
  }
  snapshot(){
    return structuredClone({statuses:this.state.statuses,backups:this.state.backups.map(({dbFile,configFile,...item})=>({...item,hasConfig:Boolean(configFile)})),jobs:this.state.jobs,storage:{directory:this.directory,maxBackupMB:256}});
  }
  validate(connection){
    if(!connection||typeof connection!=='object')throw new OperationError(400,'缺少面板连接配置');
    const id=String(connection.id||'');
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))throw new OperationError(400,'VPS 标识无效');
    const baseUrl=normalizeBaseUrl(connection.baseUrl);
    if(!this.options.allowHttp&&!baseUrl.startsWith('https:'))throw new OperationError(400,'X-Panel 地址必须使用 HTTPS');
    if(typeof connection.username!=='string'||!connection.username||typeof connection.password!=='string'||!connection.password)throw new OperationError(400,'请先保存面板账号与密码');
    const name=String(connection.name||id).slice(0,120);
    const totpSecret=normalizeTotpSecret(connection.totpSecret||'');
    return {id,name,baseUrl,username:connection.username,password:connection.password,totpSecret};
  }
  client(connection){
    const value=this.validate(connection);
    const fingerprint=createHash('sha256').update(JSON.stringify(value)).digest('hex');
    if(this.clients.get(value.id)?.fingerprint!==fingerprint){
      this.clients.set(value.id,{fingerprint,client:new RemoteClient(value,{username:value.username,password:value.password,totpSecret:value.totpSecret},{fetchImpl:this.options.fetchImpl,timeout:this.options.timeout,maxBackupBytes:this.options.maxBackupBytes,now:this.now})});
      if(this.clients.size>1000)this.clients.delete(this.clients.keys().next().value);
    }
    return this.clients.get(value.id).client;
  }
  job(connection,kind,trigger,dueToken){
    const job={id:randomUUID(),serverId:connection.id,serverName:connection.name,kind,trigger,status:'running',startedAt:this.timestamp(),finishedAt:null,message:'等待执行'};
    this.change(state=>{
      state.jobs.unshift(job);state.jobs=state.jobs.filter((item,index)=>index<200||item.status==='running');
      if(dueToken)state.scheduled[connection.id]={token:dueToken,jobId:job.id};
    });
    return job.id;
  }
  finish(id,status,message){this.change(state=>{const job=state.jobs.find(item=>item.id===id);if(job)Object.assign(job,{status,message,finishedAt:this.timestamp()});});}
  enqueue(work){
    this.pending.push(work);this.drain();
  }
  drain(){
    while(this.active<this.limit&&this.pending.length){
      const work=this.pending.shift();this.active++;
      Promise.resolve().then(work).catch(()=>console.error('VPS 运维任务异常，请检查备份目录权限')).finally(()=>{this.active--;this.drain();if(!this.active&&!this.pending.length)this.waiters.splice(0).forEach(resolve=>resolve());});
    }
  }
  idle(){return !this.active&&!this.pending.length?Promise.resolve():new Promise(resolve=>this.waiters.push(resolve));}
  check(connection,{trigger='manual',record=true}={}){
    const value=this.validate(connection);
    if(this.checks.has(value.id))return {queued:false,message:'连接检测正在执行'};
    this.checks.add(value.id);
    let id;
    try{id=record?this.job(value,'check',trigger):null;}catch(error){this.checks.delete(value.id);throw error;}
    this.enqueue(async()=>{
      try{
        const metrics=await this.client(value).status();
        this.change(state=>{state.statuses[value.id]={online:true,checkedAt:this.timestamp(),metrics:metrics??null,error:null};});
        if(id)this.finish(id,'success',metrics?'面板连接正常':'连接正常，等待面板生成状态数据');
      }catch(error){
        this.change(state=>{state.statuses[value.id]={online:false,checkedAt:this.timestamp(),metrics:null,error:error.message};});
        if(id)this.finish(id,'error',error.message);
      }finally{this.checks.delete(value.id);}
    });
    return {queued:true,jobId:id};
  }
  filename(name){if(!/^[a-f0-9-]+\.(db|json|tmp)$/.test(name))throw new OperationError(400,'备份文件标识无效');return path.join(this.files,name);}
  backup(connection,{retain=7,trigger='manual',dueToken}={}){
    const value=this.validate(connection);
    if(!Number.isInteger(retain)||retain<1||retain>100)throw new OperationError(400,'保留数量必须为 1–100');
    if(!['manual','schedule'].includes(trigger))throw new OperationError(400,'任务来源无效');
    if(trigger==='schedule'&&(!dueToken||!Number.isFinite(Date.parse(dueToken))))throw new OperationError(400,'自动备份缺少有效计划标识');
    if(trigger==='schedule'&&this.state.scheduled[value.id]?.token===dueToken)return {queued:false,alreadyQueued:true,jobId:this.state.scheduled[value.id].jobId};
    if(this.backups.has(value.id))throw new OperationError(409,'该面板已有备份任务，请等待完成');
    this.backups.add(value.id);
    let job;
    try{job=this.job(value,'backup',trigger,trigger==='schedule'?dueToken:undefined);}catch(error){this.backups.delete(value.id);throw error;}
    this.enqueue(async()=>{
      const id=randomUUID(),temporary=this.filename(`${id}.tmp`),database=this.filename(`${id}.db`),config=this.filename(`${id}.json`);
      let committed=false;
      try{
        const client=this.client(value),result=await client.downloadDatabase(temporary);
        let configuration,warning=null,hasConfig=false;
        try{configuration=await client.configuration();}catch(error){warning=`数据库已保存；配置导出失败：${error.message}`;}
        fs.renameSync(temporary,database);
        if(configuration!==undefined)try{fs.writeFileSync(config,JSON.stringify(configuration,null,2)+'\n',{mode:0o600,flag:'wx'});hasConfig=true;}catch{warning='数据库已保存；配置副本写入失败，请检查备份目录权限';try{fs.rmSync(config,{force:true});}catch{}}
        const backup={id,serverId:value.id,serverName:value.name,createdAt:this.timestamp(),...result,dbFile:`${id}.db`,configFile:hasConfig?`${id}.json`:null,warning};
        this.change(state=>state.backups.unshift(backup));committed=true;
        this.prune(value.id,retain);
        this.finish(job,'success',warning||'数据库与 Xray 配置已保存，已校验 SQLite 文件头并记录 SHA-256');
      }catch(error){this.finish(job,'error',error.message);}
      finally{for(const file of committed?[temporary]:[temporary,database,config])try{fs.rmSync(file,{force:true});}catch{}this.backups.delete(value.id);}
    });
    return {queued:true,jobId:job};
  }
  prune(serverId,retain){
    const old=this.state.backups.filter(item=>item.serverId===serverId).slice(retain);
    if(!old.length)return;
    const ids=new Set(old.map(item=>item.id));
    this.change(state=>{state.backups=state.backups.filter(item=>!ids.has(item.id));});
    for(const item of old)for(const name of [item.dbFile,item.configFile].filter(Boolean))try{fs.rmSync(this.filename(name),{force:true});}catch{console.error('旧 VPS 备份文件清理失败，请检查目录权限');}
  }
  download(id,kind='db'){
    if(!['db','config'].includes(kind))throw new OperationError(400,'下载类型无效');
    const item=this.state.backups.find(item=>item.id===id);
    if(!item)throw new OperationError(404,'备份不存在');
    const name=kind==='db'?item.dbFile:item.configFile;
    if(!name||!fs.existsSync(this.filename(name)))throw new OperationError(404,'备份文件不存在');
    return {filename:this.filename(name),bytes:fs.statSync(this.filename(name)).size,downloadName:vpsBackupFileName(item,kind),contentDisposition:vpsBackupContentDisposition(item,kind),contentType:kind==='db'?'application/octet-stream':'application/json; charset=utf-8'};
  }
  remove(id){
    const item=this.state.backups.find(item=>item.id===id);
    if(!item)throw new OperationError(404,'备份不存在');
    this.change(state=>{state.backups=state.backups.filter(item=>item.id!==id);});
    let warning=false;
    for(const name of [item.dbFile,item.configFile].filter(Boolean))try{fs.rmSync(this.filename(name),{force:true});}catch{warning=true;}
    return {ok:true,message:warning?'记录已删除，部分文件清理失败，请检查目录权限':'备份已删除'};
  }
}
