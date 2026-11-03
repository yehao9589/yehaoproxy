import {NextResponse} from "next/server";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {audit} from "../../../../lib/audit";
import {getVpsOperationsState,saveVpsBackupPlan,checkVpsServer,backupVpsServer,operateAllVps,removeVpsBackup,vpsBridgeRequest} from "../../../../lib/vps-operations";
export async function GET(req:Request){
  const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无 VPS 管理权限"},{status:403});
  const url=new URL(req.url),backupId=url.searchParams.get("download");
  try{if(backupId){const kind=url.searchParams.get("kind")||"db";if(!["db","config"].includes(kind))return NextResponse.json({error:"下载类型无效"},{status:400});const upstream=await vpsBridgeRequest("download",{backupId,kind,head:req.method==="HEAD"});const headers=new Headers({"cache-control":"no-store","x-content-type-options":"nosniff"});for(const key of ["content-type","content-length","content-disposition"]){const value=upstream.headers.get(key);if(value)headers.set(key,value);}if(req.method!=="HEAD")await audit(admin,"vps.operations.download","vps",backupId,{kind},req);return new Response(req.method==="HEAD"?null:upstream.body,{status:200,headers});}return NextResponse.json(await getVpsOperationsState(),{headers:{"cache-control":"no-store"}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"VPS 运维服务不可用"},{status:502});}
}
export const HEAD=GET;
export async function POST(req:Request){
  const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无 VPS 管理权限"},{status:403});
  const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return NextResponse.json({error:"请求内容无效"},{status:400});
  const action=String(body.action||""),serverId=String(body.serverId||"");
  try{let data:unknown,message="操作已完成";
    if(action==="save-plan"){data=await saveVpsBackupPlan(serverId,body.schedule);message="备份计划已保存";}
    else if(action==="check"){data=await checkVpsServer(serverId);message="连接检测已提交";}
    else if(action==="backup"){data=await backupVpsServer(serverId);message="备份任务已提交";}
    else if(action==="check-all"||action==="backup-all"){data=await operateAllVps(action==="check-all"?"check":"backup");message="批量任务已提交，请查看逐台执行结果";}
    else if(action==="delete-backup"){data=await removeVpsBackup(String(body.backupId||""));message=(data as {message?:string}).message||"备份已删除";}
    else return NextResponse.json({error:"不支持的 VPS 操作"},{status:400});
    await audit(admin,`vps.operations.${action}`,"vps",serverId||String(body.backupId||"")||null,{action,...(action==="save-plan"?{schedule:body.schedule}:{})},req);
    return NextResponse.json({ok:true,message,data},{status:["check","backup","check-all","backup-all"].includes(action)?202:200});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"VPS 操作失败"},{status:400});}
}
