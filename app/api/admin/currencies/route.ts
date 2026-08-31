import {asc} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {currencies,orders,systemOptions,wallets} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {upsertRecord} from "../../../../lib/db-upsert";

export async function GET(){
  if(!await requireAdminApi("settings"))return NextResponse.json({error:"无系统设置权限"},{status:403});
  const db=getDb();let items=await db.select().from(currencies).orderBy(asc(currencies.sortOrder));
  if(!items.length){
    const now=new Date();
    const defaults=[
      {code:"USD",name:"美元",symbol:"$",rate:1,enabled:true,isDefault:true,decimalPlaces:2,sortOrder:10,updatedAt:now},
      {code:"CNY",name:"人民币",symbol:"¥",rate:7.2,enabled:false,isDefault:false,decimalPlaces:2,sortOrder:20,updatedAt:now},
      {code:"EUR",name:"欧元",symbol:"€",rate:.92,enabled:false,isDefault:false,decimalPlaces:2,sortOrder:30,updatedAt:now},
      {code:"GBP",name:"英镑",symbol:"£",rate:.79,enabled:false,isDefault:false,decimalPlaces:2,sortOrder:40,updatedAt:now},
      {code:"JPY",name:"日元",symbol:"¥",rate:157,enabled:false,isDefault:false,decimalPlaces:0,sortOrder:50,updatedAt:now},
      {code:"USDT",name:"泰达币",symbol:"₮",rate:1,enabled:false,isDefault:false,decimalPlaces:2,sortOrder:60,updatedAt:now},
    ];
    for(const value of defaults)await upsertRecord(currencies,currencies.code,value.code,value,value);
    items=await db.select().from(currencies).orderBy(asc(currencies.sortOrder));
  }
  const options=await db.select().from(systemOptions);
  return NextResponse.json({items,options:Object.fromEntries(options.map((item:any)=>[item.key,item.value]))});
}

export async function POST(req:Request){
  if(!await requireAdminApi("settings"))return NextResponse.json({error:"无系统设置权限"},{status:403});
  const b=await req.json().catch(()=>null),db=getDb(),now=new Date(),code=String(b?.code||"").toUpperCase(),rate=Number(b?.rate),decimalPlaces=Number(b?.decimalPlaces),sortOrder=Number(b?.sortOrder||100);
  if(!/^[A-Z]{3,5}$/.test(code)||!b?.name||!b?.symbol||!Number.isFinite(rate)||rate<=0||!Number.isInteger(decimalPlaces)||decimalPlaces<0||decimalPlaces>4)return NextResponse.json({error:"币种配置无效"},{status:400});
  await db.update(currencies).set({enabled:false,isDefault:false,updatedAt:now});
  const values={code,name:String(b.name),symbol:String(b.symbol),rate,enabled:true,isDefault:true,decimalPlaces,sortOrder,updatedAt:now};
  await upsertRecord(currencies,currencies.code,code,values,{name:values.name,symbol:values.symbol,rate,enabled:true,isDefault:true,decimalPlaces,sortOrder,updatedAt:now});
  await Promise.all([db.update(wallets).set({currency:code,updatedAt:now}),db.update(orders).set({currency:code,updatedAt:now})]);
  return NextResponse.json({ok:true,code});
}
