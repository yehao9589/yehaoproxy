import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getTicketAutomationConfig,runTicketAutomation,saveTicketAutomationConfig} from "../../../../lib/ticket-automation";
import {audit} from "../../../../lib/audit";

export async function GET(){
  if(!await requireAdminApi("tickets"))return NextResponse.json({error:"无工单管理权限"},{status:403});
  const[config,[lastRun]]=await Promise.all([
    getTicketAutomationConfig(),
    getDb().select().from(systemOptions).where(eq(systemOptions.key,"ticket_automation_last_run")).limit(1),
  ]);
  return NextResponse.json({config,lastRun:lastRun?JSON.parse(lastRun.value):null});
}

export async function POST(req:Request){
  const admin=await requireAdminApi("tickets");if(!admin)return NextResponse.json({error:"无工单管理权限"},{status:403});
  const body=await req.json().catch(()=>null);
  if(body?.action==="run"){const result=await runTicketAutomation(new URL(req.url).origin);await audit(admin,"ticket.automation.manual_run","scheduled_task","ticket-automation",result,req);return NextResponse.json({ok:true,result})}
  const config=await saveTicketAutomationConfig(body||{});await audit(admin,"ticket.automation.update","settings","ticket-automation",config,req);return NextResponse.json({ok:true,config});
}
