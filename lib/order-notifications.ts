import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers, systemOptions} from "../db/schema";
import {brandedEmail} from "./branded-email";
import {sendTransactionalEmail} from "./email";
import {notifyAdmins} from "./admin-event-notifications";
import {periodLabel,type BillingCycle} from "./billing-period";

type CreatedOrder={id:string;customerEmail:string;product:string;region:string;quantity:number;durationDays:number;billingCycle?:BillingCycle;amount:number;currency:string};
const productNames:Record<string,string>={"static-isp":"静态住宅 IP","static-residential":"静态住宅 IP","dynamic-residential":"动态住宅代理",datacenter:"数据中心代理","soft-router":"软路由中转","computer-node":"电脑节点","cart-bundle":"合并订单"};

function render(value:string,order:CreatedOrder){return value.replaceAll("{{orderId}}",order.id).replaceAll("{{product}}",productNames[order.product]||order.product).replaceAll("{{region}}",order.region).replaceAll("{{quantity}}",String(order.quantity)).replaceAll("{{amount}}",order.amount.toFixed(2))}

export async function sendOrderCreatedEmails(order:CreatedOrder){
  const db=getDb();
  const [[templateRow],adminRows]=await Promise.all([
    db.select().from(systemOptions).where(eq(systemOptions.key,"notification_templates")).limit(1),
    db.select({email:customers.email,name:customers.name}).from(customers).where(eq(customers.role,"admin")),
  ]);
  let template:{enabled?:boolean;emailEnabled?:boolean;emailSubject?:string;emailBody?:string}|undefined;
  try{template=JSON.parse(templateRow?.value||"[]").find((item:{id?:string})=>item.id==="new_order")}catch{}
  if(template&&(template.enabled===false||template.emailEnabled===false))return;
  const product=productNames[order.product]||order.product,origin=String(process.env.PUBLIC_APP_URL||"").replace(/\/$/,"");
  const customerSubject=render(template?.emailSubject||"订单已创建",order);
  const customerBody=render(template?.emailBody||`订单 {{orderId}}（{{product}}）已创建，请及时完成支付。`,order).replace("已付款，正在等待开通","已创建，请及时完成支付");
  const details=[{label:"订单编号",value:order.id,accent:true},{label:"商品 / 服务",value:product},{label:"地区 / 数量",value:`${order.region} × ${order.quantity}`},{label:"服务周期",value:order.durationDays>0?periodLabel(order.durationDays,order.billingCycle||"fixed-days"):"多个商品周期"},{label:"订单金额",value:`${order.currency} ${order.amount.toFixed(2)}`}];
  const jobs:Promise<void>[]=[sendTransactionalEmail(order.customerEmail,customerSubject,await brandedEmail({title:customerSubject,eyebrow:"ORDER CREATED",body:customerBody,actionLabel:"查看并支付订单",actionUrl:`${origin}/dashboard?tab=orders&order=${encodeURIComponent(order.id)}`,details,notice:"订单支付成功后将进入人工开通流程。"}))];
  void adminRows;
  jobs.push(notifyAdmins("admin_new_order",{orderId:order.id,customerEmail:order.customerEmail,product,region:order.region,quantity:order.quantity,amount:`${order.currency} ${order.amount.toFixed(2)}`},details));
  await Promise.allSettled(jobs);
}
