import {NextResponse} from "next/server";
import {and,desc,eq} from "drizzle-orm";
import {getCurrentCustomer} from "../../../lib/auth";
import {getDb} from "../../../db";
import {inventory,orders,productOffers,proxyAllocations} from "../../../db/schema";
import {decryptCredential} from "../../../lib/inventory-crypto";

export async function GET(req:Request){
  const user=await getCurrentCustomer();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const reveal=new URL(req.url).searchParams.get("reveal")==="1",db=getDb();
  const owned=await db.select({allocation:proxyAllocations,product:orders.product,region:orders.region,countryName:productOffers.regionName,city:inventory.city,durationDays:orders.durationDays}).from(proxyAllocations).innerJoin(orders,eq(proxyAllocations.orderId,orders.id)).leftJoin(productOffers,and(eq(productOffers.product,orders.product),eq(productOffers.region,orders.region))).leftJoin(inventory,and(eq(inventory.host,proxyAllocations.host),eq(inventory.port,proxyAllocations.port),eq(inventory.reservedByOrderId,orders.id))).where(and(eq(orders.customerEmail,user.email),eq(proxyAllocations.status,"active"))).orderBy(desc(proxyAllocations.expiresAt)).limit(1000),items=[];
  for(const row of owned){const extractedAt=row.allocation.expiresAt?new Date(row.allocation.expiresAt.getTime()-row.durationDays*86400000):null,replaceEligibleUntil=extractedAt?new Date(extractedAt.getTime()+3*86400000):null;items.push({...row.allocation,password:reveal?await decryptCredential(row.allocation.encryptedPassword):row.allocation.encryptedPassword?"••••••••":null,encryptedPassword:undefined,product:row.product,region:row.region,countryName:row.countryName||row.region,city:row.city||null,durationDays:row.durationDays,extractedAt,replaceEligibleUntil,replaceEligible:Boolean(replaceEligibleUntil&&new Date()<=replaceEligibleUntil)})}
  return NextResponse.json({items});
}
