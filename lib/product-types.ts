import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {systemOptions} from "../db/schema";

export type ProductType = {id:string;name:string;category:"proxy"|"node";description:string;enabled:boolean;sortOrder:number};
export const defaultProductTypes: ProductType[] = [
  {id:"static-isp",name:"静态住宅 ISP",category:"proxy",description:"长期独享固定 IP，适合跨境电商和社媒运营",enabled:true,sortOrder:10},
  {id:"residential",name:"动态住宅代理",category:"proxy",description:"全球真实住宅网络，灵活用于数据与业务访问",enabled:true,sortOrder:20},
  {id:"datacenter",name:"数据中心代理",category:"proxy",description:"高速、稳定、低延迟，适合批量业务",enabled:true,sortOrder:30},
  {id:"soft-router",name:"软路由中转",category:"node",description:"提供稳定中转与路由环境，适合多设备统一连接",enabled:true,sortOrder:40},
  {id:"computer-node",name:"电脑节点",category:"node",description:"独享远程电脑环境，按使用周期灵活购买",enabled:true,sortOrder:50},
];
const KEY="product_types";

export async function getProductTypes(){
  const[row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,KEY)).limit(1);
  if(!row)return defaultProductTypes;
  try{
    const parsed=JSON.parse(row.value);
    return Array.isArray(parsed)?parsed as ProductType[]:defaultProductTypes;
  }catch{return defaultProductTypes}
}
export async function saveProductTypes(items:ProductType[]){
  const db=getDb(),now=new Date(),[existing]=await db.select().from(systemOptions).where(eq(systemOptions.key,KEY)).limit(1),value=JSON.stringify(items);
  if(existing)await db.update(systemOptions).set({value,updatedAt:now}).where(eq(systemOptions.key,KEY));
  else await db.insert(systemOptions).values({key:KEY,value,updatedAt:now});
}
