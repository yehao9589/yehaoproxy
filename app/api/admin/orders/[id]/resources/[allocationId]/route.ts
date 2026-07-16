import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../../../lib/admin-auth";
import {getDb} from "../../../../../../../db";
import {inventory,orders,proxyAllocations} from "../../../../../../../db/schema";
import {decryptCredential,encryptCredential} from "../../../../../../../lib/inventory-crypto";

export async function GET(req:Request,{params}:{params:Promise<{id:string;allocationId:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const {id,allocationId}=await params,u=new URL(req.url),db=getDb();
  const lookup=allocationId==="by-address"?and(eq(proxyAllocations.orderId,id),eq(proxyAllocations.host,u.searchParams.get("host")||""),eq(proxyAllocations.port,Number(u.searchParams.get("port")))):and(eq(proxyAllocations.id,allocationId),eq(proxyAllocations.orderId,id));
  const [row]=await db.select().from(proxyAllocations).where(lookup).limit(1);
  if(!row)return NextResponse.json({error:"已分配资源不存在"},{status:404});
  return NextResponse.json({id:row.id,host:row.host,port:row.port,username:row.username||"",password:await decryptCredential(row.encryptedPassword)||"",protocol:row.protocol,expiresAt:row.expiresAt});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string;allocationId:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const {id,allocationId}=await params,b=await req.json().catch(()=>null),db=getDb();
  const lookup=allocationId==="by-address"?and(eq(proxyAllocations.orderId,id),eq(proxyAllocations.host,String(b?.currentHost||"")),eq(proxyAllocations.port,Number(b?.currentPort))):and(eq(proxyAllocations.id,allocationId),eq(proxyAllocations.orderId,id));
  const [row]=await db.select().from(proxyAllocations).where(lookup).limit(1);
  if(!row)return NextResponse.json({error:"已分配资源不存在"},{status:404});
  const host=String(b?.host||"").trim(),port=Number(b?.port),protocol=String(b?.protocol||"HTTPS").toUpperCase();
  if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol))return NextResponse.json({error:"资源连接信息无效"},{status:400});
  const expiresAt=b?.expiresAt?new Date(String(b.expiresAt)):null;
  if(!expiresAt||Number.isNaN(expiresAt.getTime()))return NextResponse.json({error:"到期时间无效"},{status:400});
  const updates:any={host,port,username:b?.username?String(b.username):null,protocol,expiresAt};
  if(b?.password)updates.encryptedPassword=await encryptCredential(String(b.password));
  try{await db.update(proxyAllocations).set(updates).where(eq(proxyAllocations.id,row.id));await db.update(orders).set({expiresAt,updatedAt:new Date()}).where(eq(orders.id,id));const stockUpdates:any={host,port,username:updates.username,protocol,updatedAt:new Date()};if(updates.encryptedPassword)stockUpdates.encryptedPassword=updates.encryptedPassword;await db.update(inventory).set(stockUpdates).where(and(eq(inventory.reservedByOrderId,id),eq(inventory.host,row.host),eq(inventory.port,row.port)));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"资源保存失败"},{status:409})}
  return NextResponse.json({ok:true});
}
