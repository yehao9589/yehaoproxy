import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../../db";
import {authSessions,customers} from "../../../../../db/schema";
import {getCurrentCustomer,sha256} from "../../../../../lib/auth";

const IMPERSONATION_IDLE_MS=2*60*60*1000;

export async function POST(req:Request){
  const current=await getCurrentCustomer();
  if(!current||current.role!=="customer")return NextResponse.json({error:"模拟客户会话已失效"},{status:401});
  const token=req.headers.get("cookie")?.match(/(?:^|; )yh_admin_session=([^;]+)/)?.[1];
  if(!token)return NextResponse.json({error:"未处于管理员模拟登录状态"},{status:409});
  const decoded=decodeURIComponent(token),db=getDb(),[session]=await db.select().from(authSessions).where(eq(authSessions.tokenHash,await sha256(decoded))).limit(1);
  if(!session)return NextResponse.json({error:"管理员备用会话不存在"},{status:401});
  const[admin]=await db.select({role:customers.role,status:customers.status}).from(customers).where(eq(customers.id,session.customerId)).limit(1);
  if(!admin||admin.role!=="admin"||admin.status!=="active")return NextResponse.json({error:"管理员账户不可用"},{status:401});
  const expires=new Date(Date.now()+IMPERSONATION_IDLE_MS);
  await db.update(authSessions).set({expiresAt:expires}).where(eq(authSessions.id,session.id));
  const response=NextResponse.json({ok:true,expiresAt:expires});
  response.cookies.set("yh_admin_session",decoded,{httpOnly:true,secure:new URL(req.url).protocol==="https:",sameSite:"lax",path:"/",expires});
  return response;
}
