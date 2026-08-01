import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {getDb} from "../../../../../db";
import {inventory,proxyAllocations} from "../../../../../db/schema";
import {encryptCredential,inventoryFingerprint} from "../../../../../lib/inventory-crypto";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi("inventory"))return NextResponse.json({error:"无库存管理权限"},{status:403});
  const{id}=await params,body=await req.json().catch(()=>null),db=getDb();
  const[row]=await db.select().from(inventory).where(eq(inventory.id,id)).limit(1);
  if(!row)return NextResponse.json({error:"库存资源不存在"},{status:404});
  const host=body?.host===undefined?row.host:String(body.host).trim();
  const port=body?.port===undefined?row.port:Number(body.port);
  const username=body?.username===undefined?row.username:(body.username?String(body.username):null);
  const protocol=body?.protocol===undefined?row.protocol:String(body.protocol).toUpperCase();
  if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol))return NextResponse.json({error:"资源连接信息无效"},{status:400});
  const status=body?.status===undefined?row.status:String(body.status);
  if(!["available","reserved","allocated","disabled"].includes(status))return NextResponse.json({error:"库存状态无效"},{status:400});
  if(status!==row.status&&["reserved","allocated"].includes(status))return NextResponse.json({error:"已预留和已分配状态只能由订单分发流程产生"},{status:409});
  if(["reserved","allocated"].includes(row.status)&&status!==row.status)return NextResponse.json({error:"已关联订单的库存不能直接修改状态，请从订单或售后流程处理"},{status:409});
  const cost=body?.cost===undefined?row.cost:(body.cost===""||body.cost===null?null:Number(body.cost));
  if(cost!==null&&(!Number.isFinite(cost)||cost<0))return NextResponse.json({error:"采购成本无效"},{status:400});
  const updates:any={
    host,port,username,protocol,status,
    city:body?.city===undefined?row.city:(body.city?String(body.city):null),
    cost,fingerprint:await inventoryFingerprint(host,port,username),updatedAt:new Date()
  };
  if(body?.password!==undefined&&String(body.password)!=="")updates.encryptedPassword=await encryptCredential(String(body.password));
  try{
    await db.update(inventory).set(updates).where(eq(inventory.id,id));
  }catch{
    return NextResponse.json({error:"修改后的资源与现有库存重复"},{status:409});
  }
  if(row.status==="allocated"&&row.reservedByOrderId){
    const allocationUpdates:any={host,port,username,protocol};
    if(updates.encryptedPassword!==undefined)allocationUpdates.encryptedPassword=updates.encryptedPassword;
    await db.update(proxyAllocations).set(allocationUpdates).where(and(eq(proxyAllocations.orderId,row.reservedByOrderId),eq(proxyAllocations.host,row.host),eq(proxyAllocations.port,row.port)));
  }
  return NextResponse.json({ok:true});
}
