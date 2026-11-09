import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../../../lib/auth";
import {getDb} from "../../../../../db";
import {orders} from "../../../../../db/schema";
import {fetchXPanelTraffic,getCachedXPanelTraffic,getXPanelBinding} from "../../../../../lib/xpanel";
import {komariOrderTraffic} from "../../../../../lib/komari";
import {getVpsBindingState} from "../../../../../lib/vps-bindings";
import {isBindableNodeOrder} from "../../../../../lib/vps-binding-state";
import {scheduledTrafficResetAt} from "../../../../../lib/traffic-cycle";

type Traffic = Awaited<ReturnType<typeof komariOrderTraffic>> | Awaited<ReturnType<typeof getCachedXPanelTraffic>>;

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await getCurrentCustomer();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const {id}=await params;
  const [order]=await getDb().select().from(orders).where(eq(orders.id,id)).limit(1);
  if(!order||order.customerEmail!==user.email||order.status!=="active"||!isBindableNodeOrder(order)){
    return NextResponse.json({error:"节点服务不存在"},{status:404});
  }
  if(order.expiresAt&&order.expiresAt.getTime()<=Date.now())return NextResponse.json({error:"节点服务已到期，请先续费"},{status:409});

  const state=await getVpsBindingState();
  const targets=state.orders[id]||[];
  if(targets.length!==1)return NextResponse.json({configured:false,traffic:null,nextResetAt:null});

  const refresh=new URL(req.url).searchParams.get("refresh")==="1";
  const target=targets[0];
  let traffic:Traffic=null,warning:string|undefined;
  try {
    if(target.provider==="komari"){
      const komari=await komariOrderTraffic(id,refresh);
      traffic=komari;
      warning=komari?.refreshFailed?"刷新暂未成功，显示上次记录":komari?.stale?"探针数据暂未更新，显示最近采样":undefined;
    }else{
      traffic=await getCachedXPanelTraffic(id);
      if(refresh){
        const binding=await getXPanelBinding(id);
        if(binding)traffic=await fetchXPanelTraffic(binding);
      }
    }
  } catch {
    warning=traffic?"刷新暂未成功，显示上次记录":"流量暂未同步，请稍后刷新";
  }

  // The refresh may process a due boundary; read the ledger again before showing the next date.
  const latest=order.expiresAt?await getVpsBindingState():state;
  const service=latest.orders[id]?.length===1?latest.services?.[id]:undefined;
  const nextResetAt=service?scheduledTrafficResetAt(service,{orderId:id,expiresAt:order.expiresAt?.toISOString()||null}):null;
  return NextResponse.json({configured:true,traffic,warning,nextResetAt});
}
