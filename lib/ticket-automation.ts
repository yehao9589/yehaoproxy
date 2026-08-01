import {and,eq,notInArray} from "drizzle-orm";
import {getDb} from "../db";
import {customers,notifications,systemOptions,ticketMessages,tickets} from "../db/schema";
import {sendTransactionalEmail} from "./email";
import {AFTER_SALES_TICKET_CATEGORIES} from "./ticket-categories";

export type TicketAutomationConfig={
  enabled:boolean;
  reminderEnabled:boolean;
  reminderHours:number;
  autoCloseEnabled:boolean;
  autoCloseDays:number;
  siteNotificationEnabled:boolean;
  emailEnabled:boolean;
};

export const DEFAULT_TICKET_AUTOMATION_CONFIG:TicketAutomationConfig={
  enabled:true,
  reminderEnabled:true,
  reminderHours:72,
  autoCloseEnabled:true,
  autoCloseDays:7,
  siteNotificationEnabled:true,
  emailEnabled:false,
};

export async function getTicketAutomationConfig(){
  const[row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"ticket_automation_config")).limit(1);
  if(!row)return DEFAULT_TICKET_AUTOMATION_CONFIG;
  try{return {...DEFAULT_TICKET_AUTOMATION_CONFIG,...JSON.parse(row.value)} as TicketAutomationConfig}
  catch{return DEFAULT_TICKET_AUTOMATION_CONFIG}
}

export async function saveTicketAutomationConfig(input:Partial<TicketAutomationConfig>){
  const autoCloseDays=Math.min(90,Math.max(1,Number(input.autoCloseDays)||7));
  const reminderHours=Math.min(autoCloseDays*24-1,Math.max(1,Number(input.reminderHours)||72));
  const config:TicketAutomationConfig={
    enabled:Boolean(input.enabled),
    reminderEnabled:Boolean(input.reminderEnabled),
    reminderHours,
    autoCloseEnabled:Boolean(input.autoCloseEnabled),
    autoCloseDays,
    siteNotificationEnabled:Boolean(input.siteNotificationEnabled),
    emailEnabled:Boolean(input.emailEnabled),
  };
  const now=new Date();
  await getDb().insert(systemOptions).values({key:"ticket_automation_config",value:JSON.stringify(config),updatedAt:now})
    .onConflictDoUpdate({target:systemOptions.key,set:{value:JSON.stringify(config),updatedAt:now}});
  return config;
}

function emailHtml(title:string,body:string,link:string){
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24384d"><h2>${title}</h2><p style="line-height:1.8">${body}</p><p><a href="${link}" style="display:inline-block;padding:11px 18px;background:#1266e3;color:#fff;text-decoration:none;border-radius:8px">查看工单</a></p></div>`;
}

export async function runTicketAutomation(origin:string){
  const config=await getTicketAutomationConfig();
  const result={scanned:0,reminded:0,closed:0,emailed:0,emailFailed:0,skipped:0};
  if(!config.enabled)return result;
  const db=getDb(),now=new Date();
  const rows=await db.select({
    id:tickets.id,customerId:tickets.customerId,subject:tickets.subject,
    status:tickets.status,updatedAt:tickets.updatedAt,
    email:customers.email,name:customers.name,
  }).from(tickets).leftJoin(customers,eq(customers.id,tickets.customerId))
    .where(and(
      eq(tickets.status,"waiting_customer"),
      notInArray(tickets.category,[...AFTER_SALES_TICKET_CATEGORIES]),
    ));
  for(const ticket of rows){
    result.scanned++;
    const idleHours=(now.getTime()-ticket.updatedAt.getTime())/3600000;
    const cycle=String(ticket.updatedAt.getTime());
    const link="/dashboard?tab=support";
    if(config.autoCloseEnabled&&idleHours>=config.autoCloseDays*24){
      const type=`ticket_auto_closed:${ticket.id}:${cycle}`;
      const[existing]=await db.select({id:notifications.id}).from(notifications)
        .where(and(eq(notifications.customerId,ticket.customerId),eq(notifications.type,type))).limit(1);
      await db.update(tickets).set({status:"closed",updatedAt:now}).where(eq(tickets.id,ticket.id));
      await db.insert(ticketMessages).values({
        id:crypto.randomUUID(),ticketId:ticket.id,authorId:"system",authorRole:"system",
        body:`由于客户超过 ${config.autoCloseDays} 天未回复，系统已自动关闭此工单。如问题仍未解决，请重新提交工单。`,
        internal:false,createdAt:now,
      });
      if(config.siteNotificationEnabled&&!existing)await db.insert(notifications).values({
        id:crypto.randomUUID(),customerId:ticket.customerId,type,title:"工单已自动关闭",
        body:`工单 ${ticket.id} 因长时间未回复已自动关闭。`,link,read:false,createdAt:now,
      });
      if(config.emailEnabled&&ticket.email)try{
        await sendTransactionalEmail(ticket.email,"工单已自动关闭",emailHtml("工单已自动关闭",`工单 ${ticket.id}（${ticket.subject}）因超过 ${config.autoCloseDays} 天未回复已自动关闭。`,`${origin}${link}`));
        result.emailed++;
      }catch{result.emailFailed++}
      result.closed++;
      continue;
    }
    if(config.reminderEnabled&&idleHours>=config.reminderHours){
      const type=`ticket_reply_reminder:${ticket.id}:${cycle}`;
      const markerKey=`ticket_automation_reminder:${ticket.id}:${cycle}`;
      const[existing]=await db.select().from(systemOptions).where(eq(systemOptions.key,markerKey)).limit(1);
      if(existing){result.skipped++;continue}
      const remaining=Math.max(1,Math.ceil(config.autoCloseDays-idleHours/24));
      if(config.siteNotificationEnabled)await db.insert(notifications).values({
        id:crypto.randomUUID(),customerId:ticket.customerId,type,title:"工单等待您的回复",
        body:`工单 ${ticket.id} 正在等待回复${config.autoCloseEnabled?`，约 ${remaining} 天后将自动关闭`:""}。`,
        link,read:false,createdAt:now,
      });
      if(config.emailEnabled&&ticket.email)try{
        await sendTransactionalEmail(ticket.email,"工单等待您的回复",emailHtml("工单等待您的回复",`工单 ${ticket.id}（${ticket.subject}）正在等待您的回复${config.autoCloseEnabled?`，如继续未回复将在约 ${remaining} 天后自动关闭`:""}。`,`${origin}${link}`));
        result.emailed++;
      }catch{result.emailFailed++}
      await db.insert(systemOptions).values({key:markerKey,value:now.toISOString(),updatedAt:now});
      result.reminded++;
    }
  }
  await db.insert(systemOptions).values({key:"ticket_automation_last_run",value:JSON.stringify({...result,ranAt:now.toISOString()}),updatedAt:now})
    .onConflictDoUpdate({target:systemOptions.key,set:{value:JSON.stringify({...result,ranAt:now.toISOString()}),updatedAt:now}});
  return result;
}
