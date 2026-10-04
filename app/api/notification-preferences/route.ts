import {NextResponse} from "next/server";
import {getCurrentCustomer} from "../../../lib/auth";
import {getNotificationPreferences,saveNotificationPreferences} from "../../../lib/customer-notification-preferences";
import {audit} from "../../../lib/audit";
export async function GET(){const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});return NextResponse.json(await getNotificationPreferences(user.id))}
export async function PUT(req:Request){const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});const data=await req.json().catch(()=>null);if(!data||typeof data.email!=="boolean"||typeof data.site!=="boolean"||!data.topics)return NextResponse.json({error:"通知设置格式无效"},{status:400});const before=await getNotificationPreferences(user.id);const preferences=await saveNotificationPreferences(user.id,data);await audit(user,"customer.notification_preferences","customer",user.id,{before:before.preferences,after:preferences},req);return NextResponse.json({preferences,updatedAt:new Date().toISOString()})}
