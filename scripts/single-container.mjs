import {createServer,request as httpRequest} from "node:http";
import {spawn} from "node:child_process";
import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import {dirname} from "node:path";

const runtimeFile=process.env.RUNTIME_ENV_FILE||"/app/data/runtime.env";
const token=String(process.env.UPDATE_WEBHOOK_TOKEN||"");
const children=new Map();
let restarting=false;

function normalizedIp(value){
  const ip=String(value||"").trim();
  if(!ip)return "unknown";
  return ip.startsWith("::ffff:")?ip.slice(7):ip;
}

function requestIp(req){
  const socketIp=normalizedIp(req.socket.remoteAddress);
  const localProxy=socketIp==="127.0.0.1"||socketIp==="::1";
  if(!localProxy)return socketIp;
  const forwarded=String(req.headers["x-forwarded-for"]||"").split(",")[0]?.trim();
  return normalizedIp(req.headers["cf-connecting-ip"]||forwarded||req.headers["x-real-ip"]||socketIp);
}

const gateway=createServer((req,res)=>{
  const ip=requestIp(req),headers={...req.headers,host:"127.0.0.1:3001"};
  delete headers["cf-connecting-ip"];
  delete headers["true-client-ip"];
  delete headers["x-client-ip"];
  delete headers["x-cluster-client-ip"];
  delete headers.forwarded;
  headers["x-forwarded-for"]=ip;
  headers["x-real-ip"]=ip;
  const proxy=httpRequest({hostname:"127.0.0.1",port:3001,path:req.url,method:req.method,headers},upstream=>{
    res.writeHead(upstream.statusCode||502,upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error",error=>json(res,502,{error:`网站服务暂不可用：${error.message}`}));
  req.pipe(proxy);
});
gateway.listen(3000,"0.0.0.0",()=>console.log("YehaoProxy public gateway listening on 3000"));

async function runtimeEnv(){
  const values={};
  try{
    const content=await readFile(runtimeFile,"utf8");
    for(const line of content.split(/\r?\n/)){
      const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
      if(match)values[match[1]]=match[2];
    }
  }catch{/* 首次安装尚无运行配置 */}
  return values;
}

function start(name,command,args,extra={}){
  const child=spawn(command,args,{cwd:"/app",env:{...process.env,...extra},stdio:"inherit"});
  children.set(name,child);
  child.on("exit",(code,signal)=>{
    children.delete(name);
    if(!restarting){
      console.error(`[single-container] ${name} exited (${code??signal}), restarting`);
      setTimeout(()=>void bootOne(name),1500);
    }
  });
}

async function bootOne(name){
  const saved=await runtimeEnv();
  const common={...saved};
  if(name==="mysql")start(name,"node",["scripts/mysql-bridge.mjs"],{...common,PORT:"8789"});
  if(name==="xpanel")start(name,"node",["scripts/xpanel-bridge.mjs"],{PORT:"8787"});
  if(name==="web")start(name,"node",["node_modules/vinext/dist/cli.js","start","--hostname","127.0.0.1","--port","3001"],{
    ...common,DATABASE_DRIVER:"mysql",MYSQL_BRIDGE_URL:"http://127.0.0.1:8789",XPANEL_BRIDGE_URL:"http://127.0.0.1:8787",UPDATE_WEBHOOK_URL:"http://127.0.0.1:8788",
  });
  if(name==="scheduler")start(name,"node",["scripts/cron-runner.mjs"],{CRON_URL:"http://127.0.0.1:3000/api/cron/reminders"});
  if(name==="backup")start(name,"node",["scripts/update-runner.mjs"],{
    PORT:"8790",UPDATE_PROJECT_DIR:"/app",UPDATE_BACKUP_DIR:"/app/backups",
    UPDATE_WEBHOOK_TOKEN:token,RUNTIME_ENV_FILE:runtimeFile,UPDATE_SERVICES:"",
    UPDATE_HEALTH_URL:"http://127.0.0.1:3000/api/health",
  });
}

async function restartRuntime(){
  restarting=true;
  for(const child of children.values())child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,1200));
  children.clear();
  restarting=false;
  for(const name of ["mysql","xpanel","web","scheduler","backup"])await bootOne(name);
}

async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>200000)throw new Error("请求过大")}return JSON.parse(value||"{}")}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(data))}

createServer(async(req,res)=>{
  try{
    if(req.url==="/health")return json(res,200,{ready:true,mode:"single-container"});
    if(req.headers.authorization!==`Bearer ${token}`)return json(res,401,{error:"更新执行器认证失败"});
    if((req.headers["content-type"]||"").includes("application/gzip")){
      const proxy=httpRequest({hostname:"127.0.0.1",port:8790,path:req.url,method:req.method,headers:{...req.headers,host:"127.0.0.1:8790"}},upstream=>{
        res.writeHead(upstream.statusCode||502,upstream.headers);upstream.pipe(res);
      });
      proxy.on("error",error=>json(res,502,{error:`备份服务暂不可用：${error.message}`}));
      req.pipe(proxy);return;
    }
    const input=await body(req);
    if(req.method==="POST"&&input.action==="configure-database"){
      if(input.driver!=="mysql"||!input.databaseUrl)throw new Error("MySQL 数据库配置无效");
      const content=["DATABASE_DRIVER=mysql",`DATABASE_URL=${String(input.databaseUrl)}`,`MYSQL_BRIDGE_URL=${String(input.bridgeUrl||"http://127.0.0.1:8789")}`,`MYSQL_BRIDGE_SECRET=${String(input.bridgeSecret||process.env.MYSQL_BRIDGE_SECRET||"")}`].join("\n")+"\n";
      await mkdir(dirname(runtimeFile),{recursive:true});
      await writeFile(`${runtimeFile}.tmp`,content,{mode:0o600});
      await rename(`${runtimeFile}.tmp`,runtimeFile);
      setTimeout(()=>void restartRuntime(),250);
      return json(res,200,{ok:true,restarting:true});
    }
    const proxy=httpRequest({hostname:"127.0.0.1",port:8790,path:req.url,method:req.method,headers:{...req.headers,host:"127.0.0.1:8790"}},upstream=>{
      res.writeHead(upstream.statusCode||502,upstream.headers);upstream.pipe(res);
    });
    proxy.on("error",error=>json(res,502,{error:`备份服务暂不可用：${error.message}`}));
    if(req.method==="POST")proxy.end(JSON.stringify(input));else proxy.end();
  }catch(error){return json(res,500,{error:error instanceof Error?error.message:"执行失败"})}
}).listen(8788,"127.0.0.1",()=>console.log("YehaoProxy single-container controller listening on 8788"));

for(const name of ["mysql","xpanel","web","scheduler","backup"])await bootOne(name);

async function shutdown(){restarting=true;gateway.close();for(const child of children.values())child.kill("SIGTERM");process.exit(0)}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
