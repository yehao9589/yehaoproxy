import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { inventory } from "../../../../db/schema";
import { encryptCredential, inventoryFingerprint } from "../../../../lib/inventory-crypto";

export async function POST(req:Request){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const b=await req.json().catch(()=>null),lines=String(b?.lines||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length||lines.length>5000)return NextResponse.json({error:"每次请输入 1–5,000 条代理"},{status:400});
  if(!Number.isFinite(Number(b.salePrice))||Number(b.salePrice)<=0)return NextResponse.json({error:"销售价格无效"},{status:400});
  const parsed=[] as Array<{host:string;port:number;username:string|null;password:string|null;fingerprint:string}>;const seen=new Set<string>();let batchDuplicates=0;
  for(let i=0;i<lines.length;i++){
    const delimiter=lines[i].includes("|")?"|":lines[i].includes(",")?",":";",[host,port,user,password,...extra]=lines[i].split(delimiter).map(x=>x.trim());
    if(!host||extra.length||!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535)return NextResponse.json({error:`第 ${i+1} 行格式错误`},{status:400});
    const fingerprint=await inventoryFingerprint(host,Number(port),user||null);if(seen.has(fingerprint)){batchDuplicates++;continue}seen.add(fingerprint);parsed.push({host,port:Number(port),username:user||null,password:password||null,fingerprint});
  }
  if(batchDuplicates)return NextResponse.json({error:`本批数据中有 ${batchDuplicates} 条重复，请先清理`},{status:409});
  const db=getDb(),existing=seen.size?await db.select({fingerprint:inventory.fingerprint}).from(inventory).where(inArray(inventory.fingerprint,[...seen])):[];const existingSet=new Set(existing.map(x=>x.fingerprint));
  if(existing.length&&b.duplicatePolicy==="error")return NextResponse.json({error:`发现 ${existing.length} 条库存已存在`,duplicates:existing.length},{status:409});
  const fresh=parsed.filter(x=>!existingSet.has(x.fingerprint));if(!fresh.length)return NextResponse.json({ok:true,inserted:0,duplicates:existing.length},{status:200});
  const now=new Date(),values=[];for(const x of fresh)values.push({id:`INV-${crypto.randomUUID()}`,source:"manual" as const,product:String(b.product||"static-isp"),country:String(b.country||"US").toUpperCase(),city:b.city?String(b.city):null,host:x.host,port:x.port,username:x.username,encryptedPassword:await encryptCredential(x.password||""),fingerprint:x.fingerprint,protocol:String(b.protocol||"HTTPS"),cost:b.cost?Number(b.cost):null,salePrice:Number(b.salePrice),status:"available" as const,createdAt:now,updatedAt:now});
  await db.insert(inventory).values(values);return NextResponse.json({ok:true,inserted:values.length,duplicates:existing.length},{status:201});
}
