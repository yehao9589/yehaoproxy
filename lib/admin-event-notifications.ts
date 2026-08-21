import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers,systemOptions} from "../db/schema";
import {brandedEmail} from "./branded-email";
import {sendTransactionalEmail} from "./email";
const DEFAULT_ADMIN_TEMPLATES=[
  {id:"admin_new_order",enabled:true,emailEnabled:true,emailSubject:"收到新订单 {{orderId}}",emailBody:"客户 {{customerEmail}} 创建了 {{product}} 订单，地区 {{region}}，数量 {{quantity}}，金额 {{amount}}。"},
  {id:"admin_renewal",enabled:true,emailEnabled:true,emailSubject:"收到续费订单 {{orderId}}",emailBody:"客户 {{customerEmail}} 提交了续费订单，原服务 {{sourceOrderId}}，续费周期 {{durationLabel}}，金额 {{amount}}。"},
  {id:"admin_stock_low",enabled:true,emailEnabled:true,emailSubject:"商品库存不足：{{product}} / {{region}}",emailBody:"客户下单时库存不足。商品 {{product}}，地区 {{region}}，需要 {{required}}，当前可用 {{available}}。"},
];

type AdminEvent="admin_new_order"|"admin_renewal"|"admin_stock_low";
type Values=Record<string,string|number>;
function render(text:string,values:Values){return Object.entries(values).reduce((result,[key,value])=>result.replaceAll(`{{${key}}}`,String(value)),text)}

export async function notifyAdmins(event:AdminEvent,values:Values,details:Array<{label:string;value:string;accent?:boolean}>=[]){
  const db=getDb(),[[option],admins]=await Promise.all([db.select().from(systemOptions).where(eq(systemOptions.key,"admin_notification_templates")).limit(1),db.select({email:customers.email,name:customers.name}).from(customers).where(eq(customers.role,"admin"))]);
  let templates=DEFAULT_ADMIN_TEMPLATES;try{if(option?.value)templates=JSON.parse(option.value)}catch{}
  const template=templates.find(item=>item.id===event);if(!template||template.enabled===false||template.emailEnabled===false)return;
  const normalizedBody=event==="admin_renewal"?template.emailBody.replace("{{durationDays}} 天","{{durationLabel}}"):template.emailBody;
  const subject=render(template.emailSubject,values),body=render(normalizedBody,values),origin=String(process.env.PUBLIC_APP_URL||"").replace(/\/$/,"");
  await Promise.allSettled(admins.map(async admin=>sendTransactionalEmail(admin.email,subject,await brandedEmail({title:subject,eyebrow:"ADMIN NOTIFICATION",greeting:`${admin.name||"管理员"}：`,body,actionLabel:"进入管理后台",actionUrl:`${origin}/admin`,details,notice:"此邮件属于管理员运营提醒，不会发送给客户。"}))));
}
