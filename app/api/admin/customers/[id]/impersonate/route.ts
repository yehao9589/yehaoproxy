import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { customers } from "../../../../../../db/schema";
import { createSession } from "../../../../../../lib/auth";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await requireAdminApi();if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});
 const{id}=await params,[customer]=await getDb().select().from(customers).where(eq(customers.id,id)).limit(1);if(!customer||customer.role!=="customer"||customer.status!=="active")return NextResponse.json({error:"客户不存在或已停用"},{status:404});
 const current=req.headers.get("cookie")?.match(/(?:^|; )yh_session=([^;]+)/)?.[1];if(!current)return NextResponse.json({error:"管理员会话已失效"},{status:401});
 const session=await createSession(customer.id,req),secure=new URL(req.url).protocol==="https:",res=NextResponse.json({ok:true,url:"/dashboard"});
 res.cookies.set("yh_admin_session",decodeURIComponent(current),{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:3600});res.cookies.set("yh_session",session.token,{httpOnly:true,secure,sameSite:"lax",path:"/",expires:session.expires});
 await audit({id:admin.id,role:admin.role},"customer.impersonate","customer",id,{email:customer.email},req);return res;
}
