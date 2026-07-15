import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { authSessions,customers } from "../../../../../db/schema";
import { sha256 } from "../../../../../lib/auth";

export async function GET(req:Request){const token=req.headers.get("cookie")?.match(/(?:^|; )yh_admin_session=([^;]+)/)?.[1];if(!token)return NextResponse.redirect(new URL("/login",req.url));const decoded=decodeURIComponent(token),[row]=await getDb().select({session:authSessions,customer:customers}).from(authSessions).innerJoin(customers,eq(authSessions.customerId,customers.id)).where(eq(authSessions.tokenHash,await sha256(decoded))).limit(1);if(!row||row.session.expiresAt<new Date()||row.customer.role!=="admin")return NextResponse.redirect(new URL("/login",req.url));const res=NextResponse.redirect(new URL("/admin",req.url));res.cookies.set("yh_session",decoded,{httpOnly:true,secure:new URL(req.url).protocol==="https:",sameSite:"lax",path:"/",expires:row.session.expiresAt});res.cookies.set("yh_admin_session","",{httpOnly:true,path:"/",maxAge:0});return res}
