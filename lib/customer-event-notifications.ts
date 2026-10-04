import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers,notifications,systemOptions} from "../db/schema";
import {customerNotificationAllowed} from "./customer-notification-preferences";
import {sendTransactionalEmail} from "./email";
import {brandedEmail} from "./branded-email";
import type {NotificationTopic} from "./notification-preferences";
export async function notifyCustomerEvent(customerIdOrEmail:string,topic:NotificationTopic,title:string,body:string){
 // Notification delivery must never turn a completed business operation into an error.
 await Promise.allSettled([(async()=>{const db=getDb();const [customer]=await db.select().from(customers).where(customerIdOrEmail.includes("@")?eq(customers.email,customerIdOrEmail):eq(customers.id,customerIdOrEmail)).limit(1);if(!customer)return;
 const [option]=await db.select().from(systemOptions).where(eq(systemOptions.key,"scheduled_reminder_config")).limit(1);let config={enabled:true,siteEnabled:true,emailEnabled:false};try{config={...config,...JSON.parse(option?.value||"{}")}}catch{}if(!config.enabled)return;
 const jobs:Promise<unknown>[]=[];
 if(config.siteEnabled&&await customerNotificationAllowed(customer.id,topic,"site"))jobs.push(db.insert(notifications).values({id:crypto.randomUUID(),customerId:customer.id,type:topic,title,body,link:"/dashboard?tab=notifications",read:false,createdAt:new Date()}) as unknown as Promise<unknown>);
 if(config.emailEnabled&&await customerNotificationAllowed(customer.id,topic,"email"))jobs.push(sendTransactionalEmail(customer.email,title,await brandedEmail({title,body}),topic));
 await Promise.allSettled(jobs);
 })()]);
}
