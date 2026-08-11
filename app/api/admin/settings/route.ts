import {asc} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {paymentGateways,suppliers,systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {setSystemOption,upsertRecord} from "../../../../lib/db-upsert";

export async function GET(){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const db=getDb(),[payments,supplierRows,optionRows]=await Promise.all([db.select().from(paymentGateways).orderBy(asc(paymentGateways.priority)),db.select().from(suppliers).orderBy(asc(suppliers.priority)),db.select().from(systemOptions)]);
  return NextResponse.json({payments,suppliers:supplierRows,options:Object.fromEntries(optionRows.map((item:any)=>[item.key,item.value]))});
}

export async function POST(req:Request){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const b=await req.json().catch(()=>null),now=new Date();
  if(b?.kind==="system-option"){
    const key=String(b.key),value=String(b.value),validSwitch=key==="customer_node_credential_editing"&&["true","false"].includes(value),validPrice=["nodeTrafficResetPrice","ipReplacementPrice"].includes(key)&&Number.isFinite(Number(value))&&Number(value)>=0,validReplacementRule=key==="ipReplacementFreeDays"&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=365||key==="ipReplacementFreeCount"&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=100;
    if(!validSwitch&&!validPrice&&!validReplacementRule)return NextResponse.json({error:"系统配置参数无效"},{status:400});
    await setSystemOption(key,value,now);return NextResponse.json({ok:true});
  }
  if(!b||!["payment","supplier"].includes(b.kind)||!b.id)return NextResponse.json({error:"配置参数无效"},{status:400});
  if(b.kind==="payment"){
    if(!["stripe","alipay","wechat","usdt","paypal"].includes(b.type))return NextResponse.json({error:"支付类型无效"},{status:400});
    const reserved=new Set(["kind","id","name","type","enabled","priority","currencies","secretRef","webhookSecretRef"]),configuration=JSON.stringify(Object.fromEntries(Object.entries(b).filter(([key])=>!reserved.has(key))));
    const values={id:String(b.id),name:String(b.name||b.id),type:b.type,enabled:Boolean(b.enabled),priority:Number(b.priority||100),supportedCurrencies:String(b.currencies||"USD"),secretRef:b.secretRef?String(b.secretRef):null,webhookSecretRef:b.webhookSecretRef?String(b.webhookSecretRef):null,configuration,createdAt:now,updatedAt:now};
    const {createdAt,...updates}=values;await upsertRecord(paymentGateways,paymentGateways.id,values.id,values,updates);
  }else{
    const values={id:String(b.id),name:String(b.name||b.id),adapter:String(b.adapter||"generic-rest"),enabled:Boolean(b.enabled),priority:Number(b.priority||100),apiBaseUrl:b.apiBaseUrl?String(b.apiBaseUrl):null,credentialRef:b.credentialRef?String(b.credentialRef):null,createdAt:now,updatedAt:now};
    const {createdAt,...updates}=values;await upsertRecord(suppliers,suppliers.id,values.id,values,updates);
  }
  return NextResponse.json({ok:true});
}
