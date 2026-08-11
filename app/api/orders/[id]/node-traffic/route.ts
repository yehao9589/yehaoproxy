import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../../lib/auth";
import {getDb} from "../../../../../db";
import {orders} from "../../../../../db/schema";
import {fetchXPanelTraffic,getCachedXPanelTraffic,getXPanelBinding} from "../../../../../lib/xpanel";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});const{id}=await params,[order]=await getDb().select().from(orders).where(eq(orders.id,id)).limit(1);if(!order||order.customerEmail!==user.email||order.product!=="computer-node")return NextResponse.json({error:"节点服务不存在"},{status:404});if(order.expiresAt&&order.expiresAt.getTime()<=Date.now())return NextResponse.json({error:"节点服务已到期，请先续费"},{status:409});const binding=await getXPanelBinding(id);if(!binding)return NextResponse.json({configured:false,traffic:null});const cached=await getCachedXPanelTraffic(id),refresh=new URL(req.url).searchParams.get("refresh")==="1";if(refresh)try{return NextResponse.json({configured:true,traffic:await fetchXPanelTraffic(binding)})}catch(error){return NextResponse.json({configured:true,traffic:cached,warning:error instanceof Error?error.message:"同步失败"})}return NextResponse.json({configured:true,traffic:cached})}
