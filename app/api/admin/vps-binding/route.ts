import {NextResponse} from "next/server";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {audit} from "../../../../lib/audit";
import {komariOverview,bindKomariOrder} from "../../../../lib/komari";
import {getXPanelServers,saveXPanelBinding} from "../../../../lib/xpanel";
import {BindingSwitchRequired,getVpsBindingState,updateVpsBindings,validateVpsOrder,prepareServiceBinding,replaceServiceBinding,configureServiceTraffic} from "../../../../lib/vps-bindings";
async function allowed(){return await requireAdminApi("orders")||await requireAdminApi("settings");}
export async function GET(req:Request){
 if(!await allowed())return NextResponse.json({error:"无管理员权限"},{status:403});
 try{
  const orderId=new URL(req.url).searchParams.get("orderId")||"";await validateVpsOrder(orderId);
  const [overview,servers,state]=await Promise.all([komariOverview(),getXPanelServers(),getVpsBindingState()]);
  const nodes=[...overview.nodes.map(n=>({provider:"komari",id:n.uuid,name:n.name,group:n.group||"",enabled:overview.config.enabled})),...servers.map(s=>({provider:"xpanel",id:s.id,name:s.name,group:"",enabled:s.enabled}))].map(n=>({...n,owner:Object.entries(state.orders).find(([,targets])=>targets.some(t=>t.provider===n.provider&&t.serverId===n.id))?.[0]||""}));
  return NextResponse.json({current:state.orders[orderId]||[],nodes,traffic:state.services?.[orderId]||null});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"读取失败"},{status:400});}
}
export async function POST(req:Request){
 const admin=await allowed();if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});
 try{
  const b=await req.json(),orderId=String(b.orderId||""),id=String(b.serverId||"");await validateVpsOrder(orderId);
  if(b.action==="traffic-settings"){
   const total=Number(b.totalGb)*1e9,used=b.usedGb===""||b.usedGb==null?undefined:Number(b.usedGb)*1e9;
   if(!Number.isFinite(total)||total<0||used!==undefined&&(!Number.isFinite(used)||used<0)||!["sum","up","down"].includes(b.direction)||typeof b.deferOfflineReset!=="boolean")throw Error("请输入有效的服务流量设置");
   const summary=(t:Awaited<ReturnType<typeof configureServiceTraffic>>)=>t?{totalGb:t.total/1e9,usedGb:t.used/1e9,direction:t.direction,deferOfflineReset:t.deferOfflineReset}:null;
   const before=summary((await getVpsBindingState()).services?.[orderId]||null);
   const traffic=await configureServiceTraffic(orderId,{total,direction:b.direction,used,deferOfflineReset:b.deferOfflineReset});
   await audit(admin,"node.traffic.settings","order",orderId,{before,after:summary(traffic)},req);return NextResponse.json({ok:true,traffic});
  }
  if(b.provider==="komari"&&id)await bindKomariOrder(orderId,id,b.confirmation);
  else if(b.provider==="xpanel"&&id)await saveXPanelBinding({orderId,serverId:id,updatedAt:new Date().toISOString()},b.confirmation);
  else if(b.action==="unbind"){await prepareServiceBinding(orderId,null,b.confirmation);await updateVpsBindings(state=>replaceServiceBinding(state,orderId,null,b.confirmation));}
  else throw new Error("请选择绑定来源和 VPS");
  await audit(admin,"修改订单 VPS 绑定","order",orderId,{provider:b.provider||null,serverId:id||null,action:b.action||"bind"},req);
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"绑定失败",...(e instanceof BindingSwitchRequired?{confirmation:e.confirmation}:{})},{status:e instanceof BindingSwitchRequired?409:400});}
}
