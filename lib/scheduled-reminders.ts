import {and,eq,inArray} from "drizzle-orm";
import {getDb} from "../db";
import {setSystemOption} from "./db-upsert";
import {customers,notifications,orders,systemOptions} from "../db/schema";
import {sendTransactionalEmail} from "./email";
import {runTicketAutomation} from "./ticket-automation";

export type ReminderConfig={
  enabled:boolean;
  emailEnabled:boolean;
  siteEnabled:boolean;
  expiryDays:number[];
  newOrderEnabled:boolean;
  provisioningEnabled:boolean;
  provisioningMinutes:number;
};

export const DEFAULT_REMINDER_CONFIG:ReminderConfig={
  enabled:true,emailEnabled:false,siteEnabled:true,expiryDays:[7,3,1,0],
  newOrderEnabled:true,provisioningEnabled:true,provisioningMinutes:30,
};

export async function getReminderConfig(){
  const[row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_config")).limit(1);
  if(!row)return DEFAULT_REMINDER_CONFIG;
  try{return {...DEFAULT_REMINDER_CONFIG,...JSON.parse(row.value)} as ReminderConfig}catch{return DEFAULT_REMINDER_CONFIG}
}

function productName(value:string){return ({"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理","datacenter":"数据中心代理","soft-router":"软路由中转","computer-node":"电脑节点"} as Record<string,string>)[value]||value}
function emailHtml(title:string,body:string,link:string){return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24384d"><h2>${title}</h2><p style="line-height:1.8">${body}</p><p><a href="${link}" style="display:inline-block;padding:11px 18px;background:#1266e3;color:#fff;text-decoration:none;border-radius:8px">进入客户中心</a></p><p style="color:#8494a4;font-size:12px">此邮件由 YehaoProxy 服务提醒系统自动发送。</p></div>`}

export async function runScheduledReminders(origin:string){
  const config=await getReminderConfig(),ticketAutomation=await runTicketAutomation(origin),result={scanned:0,created:0,emailed:0,emailFailed:0,skipped:0,ticketAutomation};
  if(!config.enabled)return result;
  const db=getDb(),now=new Date(),maxWindow=Math.max(8,...config.expiryDays)+1;
  const [orderRows,customerRows,[templateOption]]=await Promise.all([
    db.select().from(orders).where(inArray(orders.status,["paid","provisioning","active"])),
    db.select().from(customers),
    db.select().from(systemOptions).where(eq(systemOptions.key,"notification_templates")).limit(1),
  ]);
  let templates:any[]=[];try{templates=templateOption?JSON.parse(templateOption.value):[]}catch{}
  const customerByEmail=new Map(customerRows.map(x=>[x.email.toLowerCase(),x]));
  function render(templateId:string,field:"emailSubject"|"emailBody",fallback:string,values:Record<string,string|number>){
    const source=String(templates.find(x=>x.id===templateId)?.[field]||fallback);
    return Object.entries(values).reduce((text,[key,value])=>text.replaceAll(`{{${key}}}`,String(value)),source);
  }
  async function emit(order:typeof orderRows[number],key:string,templateId:string,titleFallback:string,bodyFallback:string,values:Record<string,string|number>){
    const customer=customerByEmail.get(order.customerEmail.toLowerCase());if(!customer){result.skipped++;return}
    const title=render(templateId,"emailSubject",titleFallback,values),body=render(templateId,"emailBody",bodyFallback,values);
    const type=`scheduled:${key}:${order.id}`,emailMarker=`scheduled_email:${key}:${order.id}`;
    const [[siteRecord],[emailRecord]]=await Promise.all([
      db.select({id:notifications.id}).from(notifications).where(and(eq(notifications.customerId,customer.id),eq(notifications.type,type))).limit(1),
      db.select().from(systemOptions).where(eq(systemOptions.key,emailMarker)).limit(1),
    ]);
    const link="/dashboard?tab=proxies";
    let delivered=false;
    if(config.siteEnabled&&!siteRecord){await db.insert(notifications).values({id:crypto.randomUUID(),customerId:customer.id,type,title,body,link,read:false,createdAt:now});result.created++;delivered=true}
    if(config.emailEnabled&&!emailRecord)try{
      await sendTransactionalEmail(customer.email,title,emailHtml(title,body,`${origin}${link}`));
      await db.insert(systemOptions).values({key:emailMarker,value:now.toISOString(),updatedAt:now});
      result.emailed++;delivered=true;
    }catch{result.emailFailed++}
    if(!delivered)result.skipped++;
  }
  for(const order of orderRows){
    result.scanned++;
    const ageMinutes=(now.getTime()-order.createdAt.getTime())/60000;
    const values={orderId:order.id,product:productName(order.product),days:0,expiresAt:order.expiresAt?.toLocaleString("zh-CN",{hour12:false})||"",customerName:customerByEmail.get(order.customerEmail.toLowerCase())?.name||order.customerEmail};
    if(config.newOrderEnabled&&["paid","provisioning"].includes(order.status)&&ageMinutes<=maxWindow*1440)await emit(order,"new-order","new_order","新购服务已受理",`订单 ${order.id}（${productName(order.product)}）已付款，正在等待管理员开通。`,values);
    if(config.provisioningEnabled&&order.status==="provisioning"&&ageMinutes>=config.provisioningMinutes)await emit(order,`provisioning-${config.provisioningMinutes}`,"provisioning","服务正在等待人工开通",`订单 ${order.id} 已进入人工开通流程，我们会尽快完成交付。`,values);
    if(order.status==="active"&&order.expiresAt){
      const remaining=order.expiresAt.getTime()-now.getTime(),days=Math.ceil(remaining/86400000);
      for(const threshold of config.expiryDays)if(days===threshold){
        const title=threshold===0?"服务今天到期":`服务将在 ${threshold} 天后到期`;
        await emit(order,`expiry-${threshold}`,"expiry",title,`订单 ${order.id}（${productName(order.product)}）将于 ${order.expiresAt.toLocaleString("zh-CN",{hour12:false})} 到期，请及时续费以免服务中断。`,{...values,days:threshold,expiresAt:order.expiresAt.toLocaleString("zh-CN",{hour12:false})});
      }
      if(remaining<0&&remaining>-maxWindow*86400000)await emit(order,"expired","expired","服务已到期",`订单 ${order.id}（${productName(order.product)}）已经到期，请续费后继续使用。`,values);
    }
  }
  await setSystemOption("scheduled_reminder_last_run",JSON.stringify({...result,ranAt:now.toISOString()}),now);
  return result;
}
