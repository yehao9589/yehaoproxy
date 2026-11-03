import {env} from "cloudflare:workers";
import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {systemOptions} from "../db/schema";
import {setSystemOption} from "./db-upsert";
import {decryptCredential} from "./inventory-crypto";
import {getXPanelServers,type XPanelServer} from "./xpanel";
import {withRequestLock} from "./request-lock";
import {DEFAULT_VPS_BACKUP_SCHEDULE,normalizeVpsBackupSchedule,nextVpsBackupAt,updateVpsBackupPlan,type VpsBackupPlan} from "./vps-backup-plan";
const PLAN_KEY="vps_backup_plans";
type BridgeSnapshot={statuses:Record<string,unknown>;backups:Array<Record<string,unknown>>;jobs:Array<Record<string,unknown>>;storage?:Record<string,unknown>};
function bridgeConfig(){const e=env as unknown as Record<string,string|undefined>;const url=String(e.XPANEL_BRIDGE_URL||"").replace(/\/+$/,"");if(!url||!e.XPANEL_BRIDGE_SECRET)throw new Error("X-Panel 连接桥未配置，请检查容器内置服务");return {url,secret:e.XPANEL_BRIDGE_SECRET};}
export async function vpsBridgeRequest(action:string,body:Record<string,unknown>={}){
  const {url,secret}=bridgeConfig();let response:Response;
  const head=action==="download"&&body.head===true;
  const endpoint=head?`${url}/operations/download?backupId=${encodeURIComponent(String(body.backupId))}&kind=${encodeURIComponent(String(body.kind||"db"))}`:`${url}/operations/${action}`;
  try{response=await fetch(endpoint,{method:head?"HEAD":"POST",headers:{"content-type":"application/json","x-bridge-secret":secret},body:head?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(action==="download"&&!head?600000:20000)});}
  catch{throw new Error("VPS 运维连接桥暂不可用，请检查容器日志");}
  if(!response.ok){const data=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(data?.error||`VPS 运维服务异常（${response.status}）`);}return response;
}
async function bridgeJson(action:string,body:Record<string,unknown>={}){return (await vpsBridgeRequest(action,body)).json();}
async function plans():Promise<VpsBackupPlan[]>{const [row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,PLAN_KEY)).limit(1);if(!row?.value)return [];const value=JSON.parse(row.value);if(!Array.isArray(value))throw new Error("备份计划数据格式无效，请检查系统配置");return value;}
async function savePlans(value:VpsBackupPlan[]){await setSystemOption(PLAN_KEY,JSON.stringify(value));}
async function connection(server:XPanelServer){return {id:server.id,name:server.name,baseUrl:server.baseUrl,username:server.username,password:await decryptCredential(server.encryptedPassword),totpSecret:server.encryptedTotpSecret?await decryptCredential(server.encryptedTotpSecret):""};}
async function serverById(id:string){const server=(await getXPanelServers()).find(item=>item.id===id);if(!server)throw new Error("VPS 不存在");return server;}
export async function getVpsOperationsState(){
  const [servers,configured]=await Promise.all([getXPanelServers(),plans()]);let snapshot:BridgeSnapshot={statuses:{},backups:[],jobs:[]},bridgeError="";
  try{snapshot=await bridgeJson("state");}catch(error){bridgeError=error instanceof Error?error.message:"连接桥不可用";}
  return {...snapshot,bridgeError,servers:servers.map(server=>({id:server.id,name:server.name,group:server.group||"",baseUrl:server.baseUrl,enabled:server.enabled,lastMetrics:server.lastMetrics,lastSyncAt:server.lastSyncAt,lastSyncStatus:server.lastSyncStatus,plan:configured.find(item=>item.serverId===server.id)||{serverId:server.id,schedule:{...DEFAULT_VPS_BACKUP_SCHEDULE},nextBackupAt:null}})),timezone:"Asia/Shanghai"};
}
export async function saveVpsBackupPlan(serverId:string,input:unknown){await serverById(serverId);return withRequestLock(PLAN_KEY,async()=>{const rows=await plans(),old=rows.find(item=>item.serverId===serverId),schedule=normalizeVpsBackupSchedule(input,old?.schedule),next=updateVpsBackupPlan(serverId,schedule,old);await savePlans([...rows.filter(item=>item.serverId!==serverId),next]);return next;});}
export async function checkVpsServer(serverId:string){const server=await serverById(serverId);return bridgeJson("check",{server:await connection(server),trigger:"manual"});}
export async function backupVpsServer(serverId:string){const server=await serverById(serverId),plan=(await plans()).find(item=>item.serverId===serverId);return bridgeJson("backup",{server:await connection(server),retain:plan?.schedule.retain||7,trigger:"manual"});}
export async function operateAllVps(kind:"check"|"backup"){
  const results=[];for(const server of (await getXPanelServers()).filter(item=>item.enabled))try{await (kind==="backup"?backupVpsServer(server.id):checkVpsServer(server.id));results.push({serverId:server.id,ok:true});}catch(error){results.push({serverId:server.id,ok:false,error:error instanceof Error?error.message:"任务提交失败"});}return results;
}
export async function removeVpsBackup(backupId:string){return bridgeJson("delete-backup",{backupId});}
/** The existing scheduler triggers operations without changing billing counters. */
export async function runDueVpsOperations(){
  const result={checked:0,queued:0,failed:0},servers=await getXPanelServers();if(!servers.length)return result;
  let snapshot:BridgeSnapshot;try{snapshot=await bridgeJson("state");}catch{return {...result,failed:1};}
  const now=Date.now();
  for(const server of servers.filter(item=>item.enabled)){const status=snapshot.statuses[server.id] as {checkedAt?:string}|undefined;if(!status?.checkedAt||now-Date.parse(status.checkedAt)>=120000)try{const response=await bridgeJson("check",{server:await connection(server),trigger:"schedule",record:false});if(response.queued)result.checked++;}catch{result.failed++;}}
  await withRequestLock(PLAN_KEY,async()=>{
    const current=await plans(),ids=new Set(servers.map(server=>server.id));let changed=current.some(plan=>!ids.has(plan.serverId));const rows=current.filter(plan=>ids.has(plan.serverId));
    for(const plan of rows){if(!plan.schedule.enabled||!plan.nextBackupAt||Date.parse(plan.nextBackupAt)>now)continue;const server=servers.find(item=>item.id===plan.serverId)!;
      try{await bridgeJson("backup",{server:await connection(server),retain:plan.schedule.retain,trigger:"schedule",dueToken:plan.nextBackupAt});plan.nextBackupAt=nextVpsBackupAt(plan.schedule,now);plan.updatedAt=new Date(now).toISOString();changed=true;result.queued++;}catch{result.failed++;}}
    if(changed)await savePlans(rows);
  });return result;
}
