import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import {dirname} from "node:path";

const runtimeFile=process.env.RUNTIME_ENV_FILE||"/app/data/runtime.env";
const token=String(process.env.UPDATE_WEBHOOK_TOKEN||"");
const children=new Map();
let restarting=false;

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
  if(name==="web")start(name,"node",["node_modules/vinext/dist/cli.js","start","--hostname","0.0.0.0"],{
    ...common,DATABASE_DRIVER:"mysql",MYSQL_BRIDGE_URL:"http://127.0.0.1:8789",XPANEL_BRIDGE_URL:"http://127.0.0.1:8787",UPDATE_WEBHOOK_URL:"http://127.0.0.1:8788",
  });
  if(name==="scheduler")start(name,"node",["scripts/cron-runner.mjs"],{CRON_URL:"http://127.0.0.1:3000/api/cron/reminders"});
}

async function restartRuntime(){
  restarting=true;
  for(const child of children.values())child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,1200));
  children.clear();
  restarting=false;
  for(const name of ["mysql","xpanel","web","scheduler"])await bootOne(name);
}

async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>200000)throw new Error("请求过大")}return JSON.parse(value||"{}")}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(data))}

createServer(async(req,res)=>{
  try{
    if(req.url==="/health")return json(res,200,{ready:true,mode:"single-container"});
    if(req.headers.authorization!==`Bearer ${token}`)return json(res,401,{error:"更新执行器认证失败"});
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
    return json(res,404,{error:"单容器模式仅保留数据库配置接口；在线更新请使用宝塔更新镜像"});
  }catch(error){return json(res,500,{error:error instanceof Error?error.message:"执行失败"})}
}).listen(8788,"127.0.0.1",()=>console.log("YehaoProxy single-container controller listening on 8788"));

for(const name of ["mysql","xpanel","web","scheduler"])await bootOne(name);

async function shutdown(){restarting=true;for(const child of children.values())child.kill("SIGTERM");process.exit(0)}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
