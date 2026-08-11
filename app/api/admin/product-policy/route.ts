import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {setSystemOption} from "../../../../lib/db-upsert";

const allowed=new Set(["nodeTrafficResetPrice","ipReplacementPrice","ipReplacementFreeDays","ipReplacementFreeCount"]);

export async function POST(request:Request){
  if(!await requireAdminApi("products"))return NextResponse.json({error:"无商品管理权限"},{status:403});
  const body=await request.json().catch(()=>null);
  const offerId=String(body?.offerId||"");
  const name=String(body?.name||"");
  const value=String(body?.value??"").trim();
  if(!/^offer-[a-zA-Z0-9-]+$/.test(offerId)||!allowed.has(name))return NextResponse.json({error:"商品服务配置参数无效"},{status:400});
  if(value!==""){
    const number=Number(value);
    const integer=["ipReplacementFreeDays","ipReplacementFreeCount"].includes(name);
    const max=name==="ipReplacementFreeDays"?365:name==="ipReplacementFreeCount"?100:Number.MAX_SAFE_INTEGER;
    if(!Number.isFinite(number)||number<0||(integer&&!Number.isInteger(number))||number>max)return NextResponse.json({error:"商品服务金额或规则数值无效"},{status:400});
  }
  const key=`productPolicy:${offerId}:${name}`;
  await setSystemOption(key,value,new Date());
  return NextResponse.json({ok:true});
}
