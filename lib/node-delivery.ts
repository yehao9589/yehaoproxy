import {and,eq,or} from "drizzle-orm";
import {getDb} from "../db";
import {productOffers,systemOptions} from "../db/schema";
import {getProductTypes} from "./product-types";
export async function nodeDeliveryPolicy(order:{product:string;region:string}){
 const node=(await getProductTypes()).some(type=>type.id===order.product&&type.category==="node");
 if(!node)return {node:false,subscriptionRequired:false};
 const db=getDb(),[offer]=await db.select().from(productOffers).where(and(eq(productOffers.product,order.product),or(eq(productOffers.region,order.region),eq(productOffers.regionName,order.region)))).limit(1);
 const [option]=offer?await db.select().from(systemOptions).where(eq(systemOptions.key,`productPolicy:${offer.id}:subscriptionRequired`)).limit(1):[];
 return {node:true,subscriptionRequired:option?option.value==="1":order.product==="computer-node"};
}
