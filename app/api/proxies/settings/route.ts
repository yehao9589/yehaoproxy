import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getDb} from "../../../../db";
import {systemOptions} from "../../../../db/schema";
export async function GET(){if(!await getCurrentCustomer())return NextResponse.json({error:"请先登录"},{status:401});const rows=await getDb().select().from(systemOptions);const value=(key:string,fallback:string)=>rows.find(row=>row.key===key)?.value||fallback;return NextResponse.json({credentialEditing:value("customer_node_credential_editing","false")==="true",expiredServiceGraceDays:Number(value("expiredServiceGraceDays","7")),expiredServiceArchiveDays:Number(value("expiredServiceArchiveDays","30"))})}
