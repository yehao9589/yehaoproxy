import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { authSessions,customers } from "../../../../../db/schema";
import { createSession,getCurrentCustomer,sha256 } from "../../../../../lib/auth";
import { audit } from "../../../../../lib/audit";

export async function GET(req:Request){
 const token=req.headers.get("cookie")?.match(/(?:^|; )yh_admin_session=([^;]+)/)?.[1],loginUrl=new URL("/login?next=%2Fadmin&reason=impersonation-expired",req.url);
 if(!token)return NextResponse.redirect(loginUrl);
 const decoded=decodeURIComponent(token),db=getDb(),[session]=await db.select().from(authSessions).where(eq(authSessions.tokenHash,await sha256(decoded))).limit(1);
 if(!session||session.expiresAt<new Date())return NextResponse.redirect(loginUrl);
 const[customer]=await db.select().from(customers).where(eq(customers.id,session.customerId)).limit(1);
 if(!customer||customer.role!=="admin"||customer.status!=="active")return NextResponse.redirect(loginUrl);
 const impersonated=await getCurrentCustomer();
 const restored=await createSession(customer.id,req),res=NextResponse.redirect(new URL("/admin",req.url)),secure=new URL(req.url).protocol==="https:";
 await audit({id:customer.id,role:customer.role},"customer.impersonation.return","customer",impersonated?.id||null,{impersonatedCustomerId:impersonated?.id||null,impersonatedCustomerEmail:impersonated?.email||null},req);
 await db.delete(authSessions).where(eq(authSessions.id,session.id));
 res.cookies.set("yh_session",restored.token,{httpOnly:true,secure,sameSite:"lax",path:"/",expires:restored.expires});
 res.cookies.set("yh_admin_session","",{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:0});
 return res;
}
