import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {currencies} from "../db/schema";

export async function convertCurrency(amount:number,from:string,to:string){
  if(from===to)return Number(amount.toFixed(2));
  const db=getDb(),[source]=await db.select().from(currencies).where(eq(currencies.code,from)).limit(1),[target]=await db.select().from(currencies).where(eq(currencies.code,to)).limit(1);
  if(!source||!target||source.rate<=0||target.rate<=0)throw new Error(`缺少 ${from} → ${to} 的有效汇率配置`);
  return Number((amount/source.rate*target.rate).toFixed(target.decimalPlaces));
}
