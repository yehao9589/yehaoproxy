import {asc,eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {paymentGateways,paymentTransactions,suppliers,systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {setSystemOption,upsertRecord} from "../../../../lib/db-upsert";
import {encryptCredential} from "../../../../lib/inventory-crypto";
import {audit} from "../../../../lib/audit";

export async function GET(){
  if(!await requireAdminApi("settings"))return NextResponse.json({error:"无系统设置权限"},{status:403});
  const db=getDb(),[payments,supplierRows,optionRows]=await Promise.all([db.select().from(paymentGateways).orderBy(asc(paymentGateways.priority)),db.select().from(suppliers).orderBy(asc(suppliers.priority)),db.select().from(systemOptions)]);
  return NextResponse.json({payments,suppliers:supplierRows,options:Object.fromEntries(optionRows.map((item:any)=>[item.key,item.value]))});
}

export async function POST(req:Request){
  const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无系统设置权限"},{status:403});
  const b=await req.json().catch(()=>null),now=new Date();
  if(b?.kind==="system-option"){
    const key=String(b.key),value=String(b.value),validSwitch=key==="customer_node_credential_editing"&&["true","false"].includes(value),validPrice=["nodeTrafficResetPrice","ipReplacementPrice"].includes(key)&&Number.isFinite(Number(value))&&Number(value)>=0,validReplacementRule=key==="ipReplacementFreeDays"&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=365||key==="ipReplacementFreeCount"&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=100;
    if(!validSwitch&&!validPrice&&!validReplacementRule)return NextResponse.json({error:"系统配置参数无效"},{status:400});
    await setSystemOption(key,value,now);await audit(admin,"system.option.update","settings",key,{key,value},req);return NextResponse.json({ok:true});
  }
  if(!b||!["payment","supplier"].includes(b.kind)||!b.id)return NextResponse.json({error:"配置参数无效"},{status:400});
  if(b.kind==="payment"){
    if(b.action==="delete"){
      const id=String(b.id),[gateway]=await getDb().select().from(paymentGateways).where(eq(paymentGateways.id,id)).limit(1);
      if(!gateway)return NextResponse.json({error:"支付渠道不存在"},{status:404});
      const[transaction]=await getDb().select({id:paymentTransactions.id}).from(paymentTransactions).where(eq(paymentTransactions.gatewayId,id)).limit(1);
      if(transaction)return NextResponse.json({error:"该渠道已有支付流水，不能删除；可以关闭渠道以保留历史账单关联"},{status:409});
      await getDb().delete(paymentGateways).where(eq(paymentGateways.id,id));
      await audit(admin,"payment.gateway.delete","payment_gateway",id,{name:gateway.name,type:gateway.type},req);
      return NextResponse.json({ok:true,message:"支付渠道已删除"});
    }
    if(!["stripe","alipay","wechat","usdt","paypal"].includes(b.type))return NextResponse.json({error:"支付类型无效"},{status:400});
    if(b.enabled&&b.type!=="alipay")return NextResponse.json({error:"该支付适配器和回调验签尚未完成，当前禁止启用此渠道"},{status:409});
    const[current]=await getDb().select().from(paymentGateways).where(eq(paymentGateways.id,String(b.id))).limit(1);
    const reserved=new Set(["kind","id","name","type","enabled","priority","currencies","secretRef","webhookSecretRef","secret","alipayPublicKey","environment"]),rawConfiguration=Object.fromEntries(Object.entries(b).filter(([key])=>!reserved.has(key)));
    if(b.type==="alipay")for(const key of ["pageEnabled","wapEnabled","precreateEnabled"])rawConfiguration[key]=String(rawConfiguration[key])==="true";
    const configuration=JSON.stringify(rawConfiguration);
    const secretRef=b.type==="alipay"?(b.secret?await encryptCredential(String(b.secret)):current?.secretRef||null):b.secretRef?String(b.secretRef):current?.secretRef||null;
    const webhookSecretRef=b.type==="alipay"?(b.alipayPublicKey?await encryptCredential(String(b.alipayPublicKey)):current?.webhookSecretRef||null):b.webhookSecretRef?String(b.webhookSecretRef):current?.webhookSecretRef||null;
    if(b.type==="alipay"&&b.enabled&&(!String(b.appId||"").trim()||!secretRef||!webhookSecretRef))return NextResponse.json({error:"启用支付宝前，请完整填写应用 ID、应用私钥和支付宝公钥"},{status:400});
    const values={id:String(b.id),name:String(b.name||b.id),type:b.type,enabled:Boolean(b.enabled),priority:Number(b.priority||100),supportedCurrencies:b.type==="alipay"?"CNY":String(b.currencies||"USD"),secretRef,webhookSecretRef,configuration,createdAt:now,updatedAt:now};
    const {createdAt,...updates}=values;await upsertRecord(paymentGateways,paymentGateways.id,values.id,values,updates);
    await audit(admin,current?"payment.gateway.update":"payment.gateway.create","payment_gateway",values.id,{name:values.name,type:values.type,enabled:values.enabled,priority:values.priority,currency:values.supportedCurrencies,keyMaterialUpdated:Boolean(b.secret||b.alipayPublicKey),configurationCount:Object.keys(rawConfiguration).length},req);
  }else{
    if(b.enabled)return NextResponse.json({error:"供应商适配器尚未接入，当前禁止启用自动采购"},{status:409});
    const values={id:String(b.id),name:String(b.name||b.id),adapter:String(b.adapter||"generic-rest"),enabled:Boolean(b.enabled),priority:Number(b.priority||100),apiBaseUrl:b.apiBaseUrl?String(b.apiBaseUrl):null,credentialRef:b.credentialRef?String(b.credentialRef):null,createdAt:now,updatedAt:now};
    const {createdAt,...updates}=values;await upsertRecord(suppliers,suppliers.id,values.id,values,updates);
    await audit(admin,"supplier.settings.update","supplier",values.id,{name:values.name,adapter:values.adapter,enabled:values.enabled,priority:values.priority,apiBaseUrl:values.apiBaseUrl,keyMaterialConfigured:Boolean(values.credentialRef)},req);
  }
  return NextResponse.json({ok:true});
}
