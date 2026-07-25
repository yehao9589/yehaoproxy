import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {orders,systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {DEFAULT_REMINDER_CONFIG,getReminderConfig,runScheduledReminders} from "../../../../lib/scheduled-reminders";

export async function GET(){
  if(!await requireAdminApi("automation"))return NextResponse.json({error:"无定时任务管理权限"},{status:403});
  const db=getDb(),now=new Date(),[config,[last],active,waiting]=await Promise.all([
    getReminderConfig(),
    db.select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_last_run")).limit(1),
    db.select().from(orders).where(eq(orders.status,"active")),
    db.select().from(orders).where(eq(orders.status,"provisioning")),
  ]);
  const expiring=active.filter(x=>x.expiresAt&&x.expiresAt.getTime()>now.getTime()&&x.expiresAt.getTime()-now.getTime()<=7*86400000).length;
  const lastRun=last?JSON.parse(last.value):null,lastTime=lastRun?.ranAt?new Date(lastRun.ranAt).getTime():0,ageMinutes=lastTime?Math.floor((Date.now()-lastTime)/60000):null;
  const scriptStatus=!lastRun?"not_run":ageMinutes!==null&&ageMinutes<=90?"healthy":ageMinutes!==null&&ageMinutes<=180?"delayed":"offline";
  return NextResponse.json({config,lastRun,script:{path:"/www/wwwroot/你的域名/scripts/yehaoproxy-cron.sh",status:scriptStatus,ageMinutes,endpoint:"/api/cron/reminders",recommendedCron:"0 * * * *"},summary:{active:active.length,expiring,waiting:waiting.length},defaults:DEFAULT_REMINDER_CONFIG});
}
export async function POST(req:Request){
  if(!await requireAdminApi("automation"))return NextResponse.json({error:"无定时任务管理权限"},{status:403});
  const body=await req.json().catch(()=>null);
  if(body?.action==="run")return NextResponse.json({ok:true,result:await runScheduledReminders(new URL(req.url).origin)});
  const expiryDays=Array.isArray(body?.expiryDays)?body.expiryDays.map(Number).filter((x:number)=>Number.isInteger(x)&&x>=0&&x<=90).slice(0,8):[];
  const config={enabled:Boolean(body?.enabled),emailEnabled:Boolean(body?.emailEnabled),siteEnabled:Boolean(body?.siteEnabled),expiryDays:expiryDays.length?expiryDays:[7,3,1,0],newOrderEnabled:Boolean(body?.newOrderEnabled),provisioningEnabled:Boolean(body?.provisioningEnabled),provisioningMinutes:Math.min(10080,Math.max(5,Number(body?.provisioningMinutes)||30))};
  const now=new Date();await getDb().insert(systemOptions).values({key:"scheduled_reminder_config",value:JSON.stringify(config),updatedAt:now}).onConflictDoUpdate({target:systemOptions.key,set:{value:JSON.stringify(config),updatedAt:now}});
  return NextResponse.json({ok:true,config});
}
