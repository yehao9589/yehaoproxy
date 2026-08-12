import {asc} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {currencies,systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {upsertRecord} from "../../../../lib/db-upsert";

export async function GET(){
  if(!await requireAdminApi("finance"))return NextResponse.json({error:"无财务管理权限"},{status:403});
  const db=getDb(),items=await db.select().from(currencies).orderBy(asc(currencies.sortOrder)),options=await db.select().from(systemOptions);
  return NextResponse.json({items,options:Object.fromEntries(options.map((item:any)=>[item.key,item.value]))});
}

export async function POST(req:Request){
  if(!await requireAdminApi("finance"))return NextResponse.json({error:"无财务管理权限"},{status:403});
  const b=await req.json().catch(()=>null),db=getDb(),now=new Date(),code=String(b?.code||"").toUpperCase(),rate=Number(b?.rate),decimalPlaces=Number(b?.decimalPlaces),sortOrder=Number(b?.sortOrder||100);
  if(!/^[A-Z]{3,5}$/.test(code)||!b?.name||!b?.symbol||!Number.isFinite(rate)||rate<=0||!Number.isInteger(decimalPlaces)||decimalPlaces<0||decimalPlaces>4)return NextResponse.json({error:"币种配置无效"},{status:400});
  await db.update(currencies).set({enabled:false,isDefault:false,updatedAt:now});
  const values={code,name:String(b.name),symbol:String(b.symbol),rate,enabled:true,isDefault:true,decimalPlaces,sortOrder,updatedAt:now};
  await upsertRecord(currencies,currencies.code,code,values,{name:values.name,symbol:values.symbol,rate,enabled:true,isDefault:true,decimalPlaces,sortOrder,updatedAt:now});
  return NextResponse.json({ok:true,code});
}
