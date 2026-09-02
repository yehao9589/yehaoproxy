import {eq,sql} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {productOffers} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getProductTypes,saveProductTypes,type ProductType} from "../../../../lib/product-types";
import {audit} from "../../../../lib/audit";

function clean(body:any,current?:ProductType):ProductType|null{
  const id=String(body?.id??current?.id??"").trim().toLowerCase(),name=String(body?.name??current?.name??"").trim(),category=body?.category==="node"?"node":"proxy",description=String(body?.description??current?.description??"").trim(),sortOrder=Number(body?.sortOrder??current?.sortOrder??100);
  if(!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)||name.length<2||name.length>40||description.length>160||!Number.isInteger(sortOrder))return null;
  return{id,name,category,description,enabled:body?.enabled===undefined?(current?.enabled??true):Boolean(body.enabled),sortOrder};
}
export async function GET(){if(!await requireAdminApi("products"))return NextResponse.json({error:"无商品管理权限"},{status:403});return NextResponse.json({items:(await getProductTypes()).sort((a,b)=>a.sortOrder-b.sortOrder)})}
export async function POST(req:Request){const admin=await requireAdminApi("products");if(!admin)return NextResponse.json({error:"无商品管理权限"},{status:403});const item=clean(await req.json().catch(()=>null));if(!item)return NextResponse.json({error:"商品类型参数无效"},{status:400});const items=await getProductTypes();if(items.some(x=>x.id===item.id))return NextResponse.json({error:"商品类型标识已存在"},{status:409});items.push(item);await saveProductTypes(items);await audit(admin,"product.type.create","product_type",item.id,item,req);return NextResponse.json({ok:true,item},{status:201})}
export async function PATCH(req:Request){const admin=await requireAdminApi("products");if(!admin)return NextResponse.json({error:"无商品管理权限"},{status:403});const body=await req.json().catch(()=>null),items=await getProductTypes(),index=items.findIndex(x=>x.id===String(body?.id));if(index<0)return NextResponse.json({error:"商品类型不存在"},{status:404});const previous=items[index],item=clean(body,previous);if(!item)return NextResponse.json({error:"商品类型参数无效"},{status:400});items[index]=item;await saveProductTypes(items);await audit(admin,"product.type.update","product_type",item.id,{previous,item},req);return NextResponse.json({ok:true,item})}
export async function DELETE(req:Request){const admin=await requireAdminApi("products");if(!admin)return NextResponse.json({error:"无商品管理权限"},{status:403});const id=new URL(req.url).searchParams.get("id")||"",[usage]=await getDb().select({value:sql<number>`count(*)`}).from(productOffers).where(eq(productOffers.product,id));if(Number(usage.value)>0)return NextResponse.json({error:"该类型仍有商品配置，请先转移商品或将类型停用"},{status:409});const items=await getProductTypes(),removed=items.find(x=>x.id===id),next=items.filter(x=>x.id!==id);if(next.length===items.length)return NextResponse.json({error:"商品类型不存在"},{status:404});await saveProductTypes(next);await audit(admin,"product.type.delete","product_type",id,{name:removed?.name||id},req);return NextResponse.json({ok:true})}
