import{env}from"cloudflare:workers";
import{NextResponse}from"next/server";
import{runScheduledReminders}from"../../../../lib/scheduled-reminders";
import{systemAudit}from"../../../../lib/audit";
import{syncDueXPanelServers}from"../../../../lib/xpanel";
import{setSystemOption}from"../../../../lib/db-upsert";
import{getDb}from"../../../../db";
import{systemOptions}from"../../../../db/schema";
import{eq}from"drizzle-orm";
import{runCreditRiskChecks}from"../../../../lib/credit";

export async function POST(req:Request){
  const secret=String((env as unknown as Record<string,unknown>).CRON_SECRET||"");
  if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"未授权"},{status:401});
  const header=req.headers.get("x-yehaoproxy-scheduler");
  const source=header==="baota"?"baota":header==="container"?"container":"external";
  const[modeRow]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"scheduled_runner_mode")).limit(1);
  const selectedMode=modeRow?.value==="baota"?"baota":"container";
  if(source!==selectedMode)return NextResponse.json({ok:true,skipped:true,source,selectedMode,message:`当前已选择${selectedMode==="container"?"容器内置调度":"宝塔计划任务"}，本次请求未执行`});
  const now=new Date();
  try{
    const[reminders,vpsSync,creditRisk]=await Promise.all([runScheduledReminders(new URL(req.url).origin),syncDueXPanelServers(),runCreditRiskChecks()]);
    const result={...reminders,vpsSync,creditRisk,source};
    await setSystemOption("scheduled_reminder_runner",JSON.stringify({source,ranAt:now.toISOString(),selectedMode}),now);
    const ticket=reminders.ticketAutomation;
    const hasActivity=reminders.created>0||reminders.emailed>0||reminders.emailFailed>0||ticket.reminded>0||ticket.closed>0||ticket.emailed>0||ticket.emailFailed>0||vpsSync.failed>0||creditRisk.notificationsCreated>0;
    const[lastAudit]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_last_audit_at")).limit(1);
    const needsDailySummary=!lastAudit||lastAudit.value.slice(0,10)!==now.toISOString().slice(0,10);
    if(hasActivity||needsDailySummary){
      await systemAudit(hasActivity?"scheduled.reminders.activity":"scheduled.reminders.daily","scheduled_task","service-reminders",result);
      await setSystemOption("scheduled_reminder_last_audit_at",now.toISOString(),now);
    }
    return NextResponse.json({ok:true,result,auditLogged:hasActivity||needsDailySummary});
  }catch(error){
    const message=error instanceof Error?error.message:"定时任务执行失败";
    await systemAudit("scheduled.reminders.failed","scheduled_task","service-reminders",{source,error:message});
    return NextResponse.json({error:message},{status:500});
  }
}
