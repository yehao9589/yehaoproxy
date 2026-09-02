import {NextResponse} from "next/server";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {audit} from "../../../../lib/audit";
import {calibrateXPanelTraffic,deleteXPanelServer,fetchXPanelTraffic,getCachedXPanelTraffic,getXPanelBinding,getXPanelServers,resetXPanelCycle,saveXPanelBinding,saveXPanelServer,syncXPanelServer} from "../../../../lib/xpanel";

function publicServers(rows:Awaited<ReturnType<typeof getXPanelServers>>){return rows.map(({encryptedPassword,...x})=>({...x,totalGb:x.totalBytes/1073741824,passwordConfigured:Boolean(encryptedPassword)}))}

export async function GET(req:Request){if(!await requireAdminApi("settings"))return NextResponse.json({error:"无管理员权限"},{status:403});const orderId=new URL(req.url).searchParams.get("orderId");return NextResponse.json({servers:publicServers(await getXPanelServers()),binding:orderId?await getXPanelBinding(orderId):null,traffic:orderId?await getCachedXPanelTraffic(orderId):null})}

export async function POST(req:Request){
 const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});const b=await req.json().catch(()=>null),action=String(b?.action||"");
 try{
  if(action==="save-server"){if(!b.name||!b.baseUrl||!b.username)return NextResponse.json({error:"请填写 VPS 名称、面板地址和用户名"},{status:400});const server=await saveXPanelServer({...b,totalGb:Number(b.totalGb||0),syncIntervalMinutes:Number(b.syncIntervalMinutes||10),resetDay:Number(b.resetDay||1)});await audit(admin,"xpanel.server.save","vps",String(server.id),{name:b.name,baseUrl:b.baseUrl,username:b.username,totalGb:Number(b.totalGb||0),syncIntervalMinutes:Number(b.syncIntervalMinutes||10),resetDay:Number(b.resetDay||1),enabled:Boolean(b.enabled),keyMaterialUpdated:Boolean(b.password)},req);return NextResponse.json({ok:true})}
  if(action==="delete-server"){const serverId=String(b.serverId||"");await deleteXPanelServer(serverId);await audit(admin,"xpanel.server.delete","vps",serverId,{},req);return NextResponse.json({ok:true})}
  if(["test","sync-server"].includes(action))return NextResponse.json({ok:true,metrics:await syncXPanelServer(String(b.serverId||""))});
  if(action==="sync-all"){const rows=(await getXPanelServers()).filter(x=>x.enabled),results=[];for(const x of rows)try{results.push({id:x.id,ok:true,metrics:await syncXPanelServer(x.id)})}catch(e){results.push({id:x.id,ok:false,error:e instanceof Error?e.message:"同步失败"})}await audit(admin,"xpanel.sync_all","vps",null,{count:rows.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length},req);return NextResponse.json({ok:results.some(x=>x.ok),results})}
  if(action==="reset-cycle"){const serverId=String(b.serverId||"");await resetXPanelCycle(serverId);await audit(admin,"xpanel.cycle.reset","vps",serverId,{},req);return NextResponse.json({ok:true})}
  if(action==="calibrate"){const serverId=String(b.serverId||""),targetGb=Number(b.targetGb);if(!Number.isFinite(targetGb)||targetGb<0)return NextResponse.json({error:"请输入有效的已用流量"},{status:400});const metrics=await calibrateXPanelTraffic(serverId,targetGb);await audit(admin,"xpanel.traffic.calibrate","vps",serverId,{targetGb},req);return NextResponse.json({ok:true,metrics})}
  if(action==="bind"){const orderId=String(b.orderId),serverId=String(b.serverId),binding=await saveXPanelBinding({orderId,serverId,updatedAt:new Date().toISOString()}),metrics=await syncXPanelServer(binding.serverId);await audit(admin,"xpanel.order.bind","order",orderId,{serverId},req);return NextResponse.json({ok:true,binding,metrics})}
  if(action==="sync"){const binding=await getXPanelBinding(String(b.orderId||""));if(!binding)return NextResponse.json({error:"该订单尚未绑定 VPS"},{status:404});return NextResponse.json({ok:true,traffic:await fetchXPanelTraffic(binding)})}
  return NextResponse.json({error:"不支持的操作"},{status:400})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"X-Panel 操作失败"},{status:400})}
}
