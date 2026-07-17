import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {audit} from "../../../../../lib/audit";
import {getDb} from "../../../../../db";
import {coupons} from "../../../../../db/schema";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await requireAdminApi();if(!admin)return NextResponse.json({error:"无管理员权限"},{status:403});
  const{id}=await params,b=await req.json().catch(()=>null),db=getDb(),[current]=await db.select().from(coupons).where(eq(coupons.id,id)).limit(1);
  if(!current)return NextResponse.json({error:"优惠券不存在"},{status:404});
  const code=String(b?.code||"").trim().toUpperCase(),type=String(b?.type||""),value=Number(b?.value),minAmount=Number(b?.minAmount||0),maxDiscount=b?.maxDiscount===""||b?.maxDiscount==null?null:Number(b.maxDiscount),totalLimit=b?.totalLimit===""||b?.totalLimit==null?null:Number(b.totalLimit),startsAt=b?.startsAt?new Date(b.startsAt):null,expiresAt=b?.expiresAt?new Date(b.expiresAt):null,enabled=b?.enabled===true||b?.enabled==="true"||b?.enabled==="on";
  if(!/^[A-Z0-9_-]{3,30}$/.test(code))return NextResponse.json({error:"优惠码必须为 3–30 位英文、数字、下划线或短横线"},{status:400});
  if(!["fixed","percent"].includes(type)||!Number.isFinite(value)||value<=0)return NextResponse.json({error:"优惠类型或优惠值无效"},{status:400});
  if(type==="percent"&&value>100)return NextResponse.json({error:"百分比优惠不能超过 100%"},{status:400});
  if(!Number.isFinite(minAmount)||minAmount<0||maxDiscount!==null&&(!Number.isFinite(maxDiscount)||maxDiscount<=0)||totalLimit!==null&&(!Number.isInteger(totalLimit)||totalLimit<1))return NextResponse.json({error:"消费门槛、最大优惠或使用次数无效"},{status:400});
  if(startsAt&&expiresAt&&expiresAt<=startsAt)return NextResponse.json({error:"到期时间必须晚于开始时间"},{status:400});
  const[duplicate]=await db.select({id:coupons.id}).from(coupons).where(eq(coupons.code,code)).limit(1);if(duplicate&&duplicate.id!==id)return NextResponse.json({error:"优惠码已被使用"},{status:409});
  await db.update(coupons).set({code,type:type as "fixed"|"percent",value,minAmount,maxDiscount,totalLimit,startsAt,expiresAt,enabled}).where(eq(coupons.id,id));
  await audit({id:admin.id,role:admin.role},"coupon.update","coupon",id,{code,type,value,enabled},req);return NextResponse.json({ok:true});
}
