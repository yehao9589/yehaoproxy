import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers,systemOptions} from "../db/schema";
import {setSystemOption} from "./db-upsert";
import {normalizePreferences,notificationAllowed,type NotificationTopic} from "./notification-preferences";
export async function getNotificationPreferences(id:string){const [row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"customer_notifications:"+id)).limit(1);let value={};try{value=JSON.parse(row?.value||"{}")}catch{}return {preferences:normalizePreferences(value),updatedAt:row?.updatedAt||null}}
export async function saveNotificationPreferences(id:string,input:unknown){const preferences=normalizePreferences(input);await setSystemOption("customer_notifications:"+id,JSON.stringify(preferences),new Date());return preferences}
export async function customerNotificationAllowed(id:string,topic:NotificationTopic,channel:"email"|"site"){return notificationAllowed((await getNotificationPreferences(id)).preferences,topic,channel)}
export async function customerEmailAllowed(email:string,topic:NotificationTopic){const [customer]=await getDb().select({id:customers.id}).from(customers).where(eq(customers.email,email)).limit(1);return customer?customerNotificationAllowed(customer.id,topic,"email"):true}
