import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {orders,systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {DEFAULT_REMINDER_CONFIG,getReminderConfig,runScheduledReminders} from "../../../../lib/scheduled-reminders";
import {setSystemOption} from "../../../../lib/db-upsert";

export async function GET(){
  if(!await requireAdminApi("automation"))return NextResponse.json({error:"无定时任务管理权限"},{status:403});
  const db=getDb(),now=new Date(),[config,[last],[runner],[modeRow],active,waiting]=await Promise.all([
    getReminderConfig(),
    db.select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_last_run")).limit(1),
    db.select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_runner")).limit(1),
    db.select().from(systemOptions).where(eq(systemOptions.key,"scheduled_runner_mode")).limit(1),
    db.select().from(orders).where(eq(orders.status,"active")),
    db.select().from(orders).where(eq(orders.status,"provisioning")),
  ]);
  const expiring=active.filter(x=>x.expiresAt&&x.expiresAt.getTime()>now.getTime()&&x.expiresAt.getTime()-now.getTime()<=7*86400000).length;
  const lastRun=last?JSON.parse(last.value):null;
  let runnerInfo:{source?:string;ranAt?:string}={};try{runnerInfo=runner?JSON.parse(runner.value):{}}catch{}
  const selectedMode=modeRow?.value==="baota"?"baota":"container";
  const source=runnerInfo.source||(process.env.CONTAINER==="true"?"container":"unknown");
  const runnerTime=runnerInfo.ranAt?new Date(runnerInfo.ranAt).getTime():0;
  const ageMinutes=runnerTime?Math.floor((Date.now()-runnerTime)/60000):null;
  const sourceMatches=source===selectedMode;
  const scriptStatus=!sourceMatches||ageMinutes===null?"not_run":ageMinutes<=90?"healthy":ageMinutes<=180?"delayed":"offline";
  const mode=selectedMode==="container"?"容器内置调度器":"宝塔计划任务";
  return NextResponse.json({config,runnerMode:selectedMode,lastRun,script:{path:"/www/wwwroot/你的域名/scripts/yehaoproxy-cron.sh",status:scriptStatus,ageMinutes,endpoint:"/api/cron/reminders",recommendedCron:"0 * * * *",source,mode},summary:{active:active.length,expiring,waiting:waiting.length},defaults:DEFAULT_REMINDER_CONFIG});
}
export async function POST(req:Request){
  if(!await requireAdminApi("automation"))return NextResponse.json({error:"无定时任务管理权限"},{status:403});
  const body=await req.json().catch(()=>null);
  if(body?.action==="run")return NextResponse.json({ok:true,result:await runScheduledReminders(new URL(req.url).origin)});
  if(body?.action==="runner-mode"){
    const mode=body.mode==="baota"?"baota":body.mode==="container"?"container":null;
    if(!mode)return NextResponse.json({error:"执行方式无效"},{status:400});
    const now=new Date();await setSystemOption("scheduled_runner_mode",mode,now);
    return NextResponse.json({ok:true,runnerMode:mode});
  }
  const expiryDays=Array.isArray(body?.expiryDays)?body.expiryDays.map(Number).filter((x:number)=>Number.isInteger(x)&&x>=0&&x<=90).slice(0,8):[];
  const config={enabled:Boolean(body?.enabled),emailEnabled:Boolean(body?.emailEnabled),siteEnabled:Boolean(body?.siteEnabled),expiryDays:expiryDays.length?expiryDays:[7,3,1,0],newOrderEnabled:Boolean(body?.newOrderEnabled),provisioningEnabled:Boolean(body?.provisioningEnabled),provisioningMinutes:Math.min(10080,Math.max(5,Number(body?.provisioningMinutes)||30))};
  const now=new Date();await setSystemOption("scheduled_reminder_config",JSON.stringify(config),now);
  return NextResponse.json({ok:true,config});
}
