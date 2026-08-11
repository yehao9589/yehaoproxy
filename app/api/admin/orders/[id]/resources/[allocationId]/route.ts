import {NextResponse} from "next/server";
import {and,eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../../../lib/admin-auth";
import {getDb} from "../../../../../../../db";
import {orders,proxyAllocations} from "../../../../../../../db/schema";
import {decryptCredential,encryptCredential} from "../../../../../../../lib/inventory-crypto";
import {normalizeCityName} from "../../../../../../../lib/cities";
import {audit} from "../../../../../../../lib/audit";

function adminDate(value:unknown){const raw=String(value||"").trim();return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)?`${raw}+08:00`:raw)}

export async function GET(req:Request,{params}:{params:Promise<{id:string;allocationId:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const {id,allocationId}=await params,u=new URL(req.url),db=getDb();
  const lookup=allocationId==="by-address"?and(eq(proxyAllocations.orderId,id),eq(proxyAllocations.host,u.searchParams.get("host")||""),eq(proxyAllocations.port,Number(u.searchParams.get("port")))):and(eq(proxyAllocations.id,allocationId),eq(proxyAllocations.orderId,id));
  const [row]=await db.select().from(proxyAllocations).where(lookup).limit(1);
  if(!row)return NextResponse.json({error:"已分配资源不存在"},{status:404});
  const [order]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  return NextResponse.json({id:row.id,host:row.host,port:row.port,username:row.username||"",password:await decryptCredential(row.encryptedPassword)||"",wifiName:row.wifiName||"",protocol:row.protocol,country:order?.region||"",city:row.note?.match(/\[CITY\]([^\n]*)/)?.[1]||"",expiresAt:row.expiresAt});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string;allocationId:string}>}){
  const admin=await requireAdminApi("orders");if(!admin)return NextResponse.json({error:"无订单管理权限"},{status:403});
  const {id,allocationId}=await params,b=await req.json().catch(()=>null),db=getDb();
  const lookup=allocationId==="by-address"?and(eq(proxyAllocations.orderId,id),eq(proxyAllocations.host,String(b?.currentHost||"")),eq(proxyAllocations.port,Number(b?.currentPort))):and(eq(proxyAllocations.id,allocationId),eq(proxyAllocations.orderId,id));
  const [row]=await db.select().from(proxyAllocations).where(lookup).limit(1);
  if(!row)return NextResponse.json({error:"已分配资源不存在"},{status:404});
  const host=String(b?.host||"").trim(),port=Number(b?.port),wifiName=String(b?.wifiName||"").trim()||null,protocol=String(b?.protocol||"HTTPS").toUpperCase(),country=String(b?.country||"").trim().toUpperCase(),city=normalizeCityName(String(b?.city||""));
  if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol)||!/^[A-Z]{2}$/.test(country)||!city)return NextResponse.json({error:"请填写有效的连接信息、国家代码和城市"},{status:400});
  const expiresAt=b?.expiresAt?adminDate(b.expiresAt):null;
  if(!expiresAt||Number.isNaN(expiresAt.getTime()))return NextResponse.json({error:"到期时间无效"},{status:400});
  const cleanNote=String(row.note||"").replace(/\n?\[CITY\][^\n]*/g,"").trim();
  const updates:any={host,port,username:b?.username?String(b.username):null,wifiName,protocol,note:`${cleanNote}${cleanNote?"\n":""}[CITY]${city}`,expiresAt};
  if(b?.password)updates.encryptedPassword=await encryptCredential(String(b.password));
  const [order]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  try{await db.update(proxyAllocations).set(updates).where(eq(proxyAllocations.id,row.id));await db.update(orders).set({expiresAt,region:country,updatedAt:new Date()}).where(eq(orders.id,id));await audit({id:admin.id,role:admin.role},"proxy.resource.update","proxy",row.id,{orderId:id,previousExpiresAt:row.expiresAt?.toISOString()||null,expiresAt:expiresAt.toISOString(),previousAddress:`${row.host}:${row.port}`,address:`${host}:${port}`,previousCountry:order?.region||null,country,previousCity:row.note?.match(/\[CITY\]([^\n]*)/)?.[1]||null,city,protocol,passwordChanged:Boolean(b?.password)},req);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"资源保存失败"},{status:409})}
  return NextResponse.json({ok:true});
}
