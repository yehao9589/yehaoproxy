import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {getDb} from "../../../../../db";
import {inventory,proxyAllocations} from "../../../../../db/schema";
import {encryptCredential,inventoryFingerprint} from "../../../../../lib/inventory-crypto";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const {id}=await params,b=await req.json().catch(()=>null),db=getDb();
  const [row]=await db.select().from(inventory).where(eq(inventory.id,id)).limit(1);
  if(!row)return NextResponse.json({error:"库存不存在"},{status:404});
  const host=b?.host===undefined?row.host:String(b.host).trim(),port=b?.port===undefined?row.port:Number(b.port),username=b?.username===undefined?row.username:(b.username?String(b.username):null),protocol=b?.protocol===undefined?row.protocol:String(b.protocol).toUpperCase();
  if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol))return NextResponse.json({error:"资源连接信息无效"},{status:400});
  const status=b?.status===undefined?row.status:String(b.status);
  if(!["available","reserved","allocated","disabled"].includes(status))return NextResponse.json({error:"库存状态无效"},{status:400});
  const salePrice=b?.salePrice===undefined?row.salePrice:Number(b.salePrice),cost=b?.cost===undefined?row.cost:(b.cost===""||b.cost===null?null:Number(b.cost));
  if(!Number.isFinite(salePrice)||salePrice<=0||cost!==null&&!Number.isFinite(cost))return NextResponse.json({error:"成本或售价无效"},{status:400});
  const updates:any={host,port,username,protocol,status,city:b?.city===undefined?row.city:(b.city?String(b.city):null),cost,salePrice,fingerprint:await inventoryFingerprint(host,port,username),updatedAt:new Date()};
  if(b?.password!==undefined&&String(b.password)!=="")updates.encryptedPassword=await encryptCredential(String(b.password));
  try{await db.update(inventory).set(updates).where(eq(inventory.id,id));}catch{return NextResponse.json({error:"修改后的资源与现有库存重复"},{status:409})}
  if(row.status==="allocated"&&row.reservedByOrderId){const allocationUpdates:any={host,port,username,protocol};if(updates.encryptedPassword!==undefined)allocationUpdates.encryptedPassword=updates.encryptedPassword;await db.update(proxyAllocations).set(allocationUpdates).where(and(eq(proxyAllocations.orderId,row.reservedByOrderId),eq(proxyAllocations.host,row.host),eq(proxyAllocations.port,row.port)));}
  return NextResponse.json({ok:true});
}
