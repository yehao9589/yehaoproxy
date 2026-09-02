import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {setSystemOption} from "../../../../lib/db-upsert";
import {audit} from "../../../../lib/audit";

const DEFAULTS={expiredServiceGraceDays:7,expiredServiceArchiveDays:30};

export async function GET(){
  if(!await requireAdminApi("settings"))return NextResponse.json({error:"无系统设置权限"},{status:403});
  const rows=await getDb().select().from(systemOptions);
  const value=(key:keyof typeof DEFAULTS)=>Number(rows.find(row=>row.key===key)?.value??DEFAULTS[key]);
  return NextResponse.json({graceDays:value("expiredServiceGraceDays"),archiveDays:value("expiredServiceArchiveDays")});
}

export async function POST(req:Request){
  const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无系统设置权限"},{status:403});
  const body=await req.json().catch(()=>null),graceDays=Number(body?.graceDays),archiveDays=Number(body?.archiveDays);
  if(!Number.isInteger(graceDays)||graceDays<0||graceDays>3650||!Number.isInteger(archiveDays)||archiveDays<1||archiveDays>3650||archiveDays<=graceDays)return NextResponse.json({error:"归档时间必须大于原列表保留时间"},{status:400});
  const db=getDb(),updatedAt=new Date();
  for(const[key,value]of Object.entries({expiredServiceGraceDays:graceDays,expiredServiceArchiveDays:archiveDays}))await setSystemOption(key,String(value),updatedAt);
  await audit(admin,"expiry.policy.update","settings","service-expiry",{graceDays,archiveDays},req);
  return NextResponse.json({ok:true,graceDays,archiveDays});
}
