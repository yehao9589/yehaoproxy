import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../lib/auth";
import {getDb} from "../../../../db";
import {systemOptions} from "../../../../db/schema";
export async function GET(){if(!await getCurrentCustomer())return NextResponse.json({error:"请先登录"},{status:401});const[row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"customer_node_credential_editing")).limit(1);return NextResponse.json({credentialEditing:row?.value==="true"})}
