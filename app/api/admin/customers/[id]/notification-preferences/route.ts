import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getDb} from "../../../../../../db";
import {customers} from "../../../../../../db/schema";
import {requireAdminApi} from "../../../../../../lib/admin-auth";
import {getNotificationPreferences,saveNotificationPreferences} from "../../../../../../lib/customer-notification-preferences";
import {audit} from "../../../../../../lib/audit";
async function target(id:string){const [row]=await getDb().select().from(customers).where(eq(customers.id,id)).limit(1);return row?.role==="customer"?row:null}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){if(!await requireAdminApi("customers"))return NextResponse.json({error:"无客户管理权限"},{status:403});const {id}=await params;if(!await target(id))return NextResponse.json({error:"客户不存在"},{status:404});return NextResponse.json(await getNotificationPreferences(id))}
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){const admin=await requireAdminApi("customers");if(!admin)return NextResponse.json({error:"无客户管理权限"},{status:403});const {id}=await params;if(!await target(id))return NextResponse.json({error:"客户不存在"},{status:404});const data=await req.json().catch(()=>null);if(!data||typeof data.email!=="boolean"||typeof data.site!=="boolean"||!data.topics)return NextResponse.json({error:"通知设置格式无效"},{status:400});const before=await getNotificationPreferences(id);const preferences=await saveNotificationPreferences(id,data);await audit(admin,"customer.notification_preferences","customer",id,{before:before.preferences,after:preferences},req);return NextResponse.json({preferences,updatedAt:new Date().toISOString()})}
