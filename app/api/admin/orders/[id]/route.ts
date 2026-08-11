import{NextResponse}from"next/server";
import{and,desc,eq,sql}from"drizzle-orm";
import{requireAdminApi}from"../../../../../lib/admin-auth";
import{getDb}from"../../../../../db";
import{customers,orders,paymentTransactions,productOffers,proxyAllocations,serviceRequests}from"../../../../../db/schema";
import{encryptCredential}from"../../../../../lib/inventory-crypto";
import{normalizeCityName}from"../../../../../lib/cities";
import{addBillingPeriod,billingCycleFromNote}from"../../../../../lib/billing-period";
import{getXPanelBinding,getXPanelServers}from"../../../../../lib/xpanel";

const metadataLine=/^\[[A-Z_]+\][^\n]*$/gm;
function adminDate(value:unknown){const raw=String(value||"").trim();return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)?`${raw}+08:00`:raw)}
function visibleNote(value:string|null){return String(value||"").replace(metadataLine,"").replace(/\n{2,}/g,"\n").trim()||null}
function metadata(value:string|null){return String(value||"").match(metadataLine)?.join("\n")||""}

export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi("orders"))return NextResponse.json({error:"无订单管理权限"},{status:403});
  const{id}=await params,db=getDb(),[storedOrder]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  let order=storedOrder;
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  const[customer]=await db.select({id:customers.id,email:customers.email,name:customers.name,status:customers.status}).from(customers).where(eq(customers.email,order.customerEmail)).limit(1);
  const relatedOrders=order.product==="cart-bundle"
    ?(await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail))).filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${id}`))
    :[order];
  const renewalOf=order.adminNote?.match(/\[RENEWAL_OF\]([^\n]+)/)?.[1]?.trim()||null;
  const renewalAllocationId=order.adminNote?.match(/\[RENEW_ALLOCATION\]([^\n]+)/)?.[1]?.trim()||null;
  if(order.product==="cart-bundle"&&relatedOrders.length>0&&relatedOrders.every(item=>item.status==="active")&&order.status!=="active"){
    const expiresAt=relatedOrders.map(item=>item.expiresAt).filter((value):value is Date=>!!value).sort((a,b)=>b.getTime()-a.getTime())[0]||order.expiresAt;
    const updatedAt=new Date();
    await db.update(orders).set({status:"active",expiresAt,updatedAt}).where(eq(orders.id,id));
    order={...order,status:"active",expiresAt,updatedAt};
  }
  const ipOrders=renewalOf?[]:relatedOrders.filter(item=>!["computer-node","soft-router","cart-bundle"].includes(item.product));
  const allocationDetails:any[]=[];
  const allocationCountByOrder=new Map<string,number>();
  for(const item of relatedOrders){
    const rows=await db.select().from(proxyAllocations).where(eq(proxyAllocations.orderId,item.id));
    allocationCountByOrder.set(item.id,rows.length);
    allocationDetails.push(...rows.map(row=>({...row,country:item.region,city:row.note?.match(/\[CITY\]([^\n]*)/)?.[1]||null})));
  }
  const targetOrder=ipOrders.find(item=>["paid","provisioning"].includes(item.status)&&(allocationCountByOrder.get(item.id)||0)<item.quantity)||null;
  const manualDelivery={
    sourceOrderId:id,
    targetOrderId:targetOrder?.id||null,
    quantity:ipOrders.reduce((sum,item)=>sum+item.quantity,0),
    allocated:ipOrders.reduce((sum,item)=>sum+(allocationCountByOrder.get(item.id)||0),0),
    region:targetOrder?.region||order.region,
  };
  const payments=await db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId,id));
  const subscriptionUrl=order.adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1]||null;
  const itemAmount=order.adminNote?.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)?.[1],billingOrderId=order.adminNote?.match(/\[BUNDLE_PARENT\]([^\n]+)/)?.[1];
  const visibleOrder={...order,amount:itemAmount==null?order.amount:Number(itemAmount),adminNote:visibleNote(order.adminNote),subscriptionUrl,billingOrderId:billingOrderId||null,billingCycle:billingCycleFromNote(order.adminNote)};
  const[offer]=await db.select().from(productOffers).where(and(eq(productOffers.product,order.product),eq(productOffers.region,order.region))).limit(1);
  const availableRenewalPeriods=visibleOrder.billingCycle==="calendar-month"
    ?[(offer?.price30??-1)>=0?30:null,(offer?.price90??-1)>=0?90:null].filter((value):value is number=>value!==null)
    :[(offer?.price7??-1)>=0?7:null,(offer?.price30??-1)>=0?30:null,(offer?.price90??-1)>=0?90:null].filter((value):value is number=>value!==null);
  const childOrders=order.product==="cart-bundle"?relatedOrders.map(item=>({
    id:item.id,product:item.product,region:item.region,quantity:item.quantity,durationDays:item.durationDays,
    amount:Number(item.adminNote?.match(/\[BUNDLE_ITEM_AMOUNT\]([^\n]+)/)?.[1]??item.amount),status:item.status,
    expiresAt:item.expiresAt,subscriptionUrl:item.adminNote?.match(/\[SUBSCRIPTION_URL\]([^\n]+)/)?.[1]||null,
  })):[];
  const[renewalSourceOrder]=renewalOf?await db.select().from(orders).where(eq(orders.id,renewalOf)).limit(1):[null];
  const[renewalAllocation]=renewalAllocationId?await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,renewalAllocationId)).limit(1):[null];
  const renewalBinding=renewalOf?await getXPanelBinding(renewalOf):null;
  const renewalVps=renewalBinding?(await getXPanelServers()).find(server=>server.id===renewalBinding.serverId):null;
  const renewalContext=renewalOf?{
    sourceOrder:renewalSourceOrder||null,
    allocation:renewalAllocation?{...renewalAllocation,city:renewalAllocation.note?.match(/\[CITY\]([^\n]*)/)?.[1]||null}:null,
    vpsName:renewalVps?.name||null,
  }:null;
  const oneTimeProducts=new Set(["ip-replacement","node-traffic-reset"]);
  let serviceContext:null|{kind:string;targetOrder:any|null;targetAllocation:any|null;request:any|null}=null;
  if(oneTimeProducts.has(order.product)||order.durationDays===0&&order.adminNote?.includes("[BILLING_MODE]one-time")){
    const targetOrderId=order.adminNote?.match(/\[(?:TARGET_ORDER|RESET_OF)\]([^\n]+)/)?.[1]?.trim()||null;
    const allocationId=order.adminNote?.match(/\[REPLACE_ALLOCATION\]([^\n]+)/)?.[1]?.trim()||null;
    const[targetOrder]=targetOrderId?await db.select().from(orders).where(eq(orders.id,targetOrderId)).limit(1):[null];
    const[targetAllocation]=allocationId?await db.select().from(proxyAllocations).where(eq(proxyAllocations.id,allocationId)).limit(1):[null];
    const requestType=order.product==="ip-replacement"?"replace":order.product==="node-traffic-reset"?"reset_traffic":"custom";
    const requestTarget=allocationId||targetOrderId;
    const requests=requestTarget?await db.select().from(serviceRequests).where(and(eq(serviceRequests.allocationId,requestTarget),eq(serviceRequests.type,requestType as "replace"|"reset_traffic"|"custom"))).orderBy(desc(serviceRequests.createdAt)):[];
    const request=requests.find(item=>String(item.reason||"").includes(order.id))||requests[0]||null;
    serviceContext={kind:requestType,targetOrder:targetOrder||null,targetAllocation:targetAllocation?{...targetAllocation,city:targetAllocation.note?.match(/\[CITY\]([^\n]*)/)?.[1]||null}:null,request};
  }
  return NextResponse.json({order:visibleOrder,customer:customer||null,allocations:allocationDetails,payments,manualDelivery,relatedOrders:childOrders,serviceContext,renewalContext,availableRenewalPeriods,availableRenewalBillingCycle:offer?.billingCycle||null});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi("orders"))return NextResponse.json({error:"无订单管理权限"},{status:403});
  const{id}=await params,b=await req.json().catch(()=>null),action=String(b?.action||""),db=getDb();
  const[order]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  const now=new Date();
  if(action==="deliver-subscription"){
    if(order.product!=="computer-node")return NextResponse.json({error:"只有电脑节点订单可以发放订阅地址"},{status:400});
    if(!["paid","provisioning","active"].includes(order.status))return NextResponse.json({error:"当前订单状态不能发放订阅地址"},{status:409});
    const subscriptionUrl=String(b?.subscriptionUrl||"").trim();
    try{const parsed=new URL(subscriptionUrl);if(!["http:","https:"].includes(parsed.protocol))throw new Error()}catch{return NextResponse.json({error:"请输入有效的 HTTP 或 HTTPS 订阅地址"},{status:400})}
    const cleanNote=String(order.adminNote||"").replace(/\n?\[SUBSCRIPTION_URL\][^\n]*/g,"").trim();
    const adminNote=`${cleanNote}${cleanNote?"\n":""}[SUBSCRIPTION_URL]${subscriptionUrl}`;
    const expiresAt=order.expiresAt||addBillingPeriod(now,order.durationDays,billingCycleFromNote(order.adminNote));
    await db.update(orders).set({adminNote,status:"active",expiresAt,updatedAt:now}).where(eq(orders.id,id));
    const parentId=order.adminNote?.match(/\[BUNDLE_PARENT\]([^\n]+)/)?.[1]?.trim();
    if(parentId){
      const siblings=(await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail))).filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${parentId}`));
      const afterDelivery=siblings.map(item=>item.id===id?{...item,status:"active" as const,expiresAt}:item);
      if(afterDelivery.length>0&&afterDelivery.every(item=>item.status==="active")){
        const parentExpiry=afterDelivery.map(item=>item.expiresAt).filter((value):value is Date=>!!value).sort((a,b)=>b.getTime()-a.getTime())[0]||expiresAt;
        await db.update(orders).set({status:"active",expiresAt:parentExpiry,updatedAt:now}).where(eq(orders.id,parentId));
      }
    }
    return NextResponse.json({ok:true,status:"active",subscriptionUrl,expiresAt});
  }
  if(action==="service-update"){
    const currentInternal=metadata(order.adminNote),written=String(b?.adminNote||"").replace(metadataLine,"").trim(),requestedCycle=String(b?.billingCycle||billingCycleFromNote(order.adminNote)),internalWithoutCycle=currentInternal.replace(/\n?\[BILLING_CYCLE\][^\n]*/g,"").trim(),internal=`${internalWithoutCycle}${internalWithoutCycle?"\n":""}[BILLING_CYCLE]${requestedCycle}`;
    const paymentMethod=String(b?.paymentMethod||"balance"),expiresAt=b?.expiresAt?adminDate(b.expiresAt):null,renewalAmount=b?.renewalAmount===""||b?.renewalAmount==null?null:Number(b.renewalAmount),durationDays=b?.durationDays==null||b.durationDays===""?order.durationDays:Number(b.durationDays),autoRenew=b?.autoRenew===true||b?.autoRenew==="true"||b?.autoRenew==="on",adminNote=`${internal}${internal&&written?"\n":""}${written}`.slice(0,1000),nextStatus=String(b?.status||order.status),cycle=requestedCycle;
    const validDuration=order.product==="cart-bundle"
      ?durationDays===0
      :Number.isInteger(durationDays)&&durationDays>0&&durationDays<=3650&&(cycle!=="calendar-month"||durationDays%30===0);
    if(!["fixed-days","calendar-month"].includes(cycle)||!["balance","manual","alipay","wechat","paypal","usdt","bank"].includes(paymentMethod)||expiresAt&&Number.isNaN(expiresAt.getTime())||renewalAmount!==null&&(!Number.isFinite(renewalAmount)||renewalAmount<0)||!validDuration||!["pending","paid","provisioning","active"].includes(nextStatus))return NextResponse.json({error:cycle==="calendar-month"&&durationDays===7?"自然月计费不能使用 7 天周期":"续费周期或订单参数无效"},{status:400});
    if(order.product==="computer-node"&&nextStatus==="active"&&!order.adminNote?.includes("[SUBSCRIPTION_URL]"))return NextResponse.json({error:"电脑节点必须先发放有效订阅链接，不能直接修改为已激活"},{status:409});
    if(["refunded","failed"].includes(order.status))return NextResponse.json({error:"已退款或已取消订单不可重新激活"},{status:409});
    await db.update(orders).set({paymentMethod,expiresAt,renewalAmount,durationDays,autoRenew,adminNote,status:nextStatus as typeof order.status,updatedAt:now}).where(eq(orders.id,id));
    if(expiresAt)await db.update(proxyAllocations).set({expiresAt,autoRenew}).where(eq(proxyAllocations.orderId,id));
    return NextResponse.json({ok:true,status:nextStatus});
  }
  if(action==="update"){
    if(order.status!=="pending")return NextResponse.json({error:"只有待付款订单可以修改商品、地区、数量和金额"},{status:409});
    const product=String(b?.product||order.product),region=String(b?.region||order.region).toUpperCase(),quantity=Number(b?.quantity??order.quantity),durationDays=Number(b?.durationDays??order.durationDays),amount=Number(b?.amount??order.amount);
    if(!product||!/^[A-Z]{2}$/.test(region)||!Number.isInteger(quantity)||quantity<1||quantity>500||![7,30,90].includes(durationDays)||!Number.isFinite(amount)||amount<0)return NextResponse.json({error:"订单修改参数无效"},{status:400});
    const[offer]=await db.select().from(productOffers).where(and(eq(productOffers.product,product),eq(productOffers.region,region))).limit(1);
    if(!offer||!offer.enabled)return NextResponse.json({error:"目标商品地区未上架"},{status:409});
    const releasedSame=product===order.product&&region===order.region?order.quantity:0;
    if(offer.saleStock>=0&&offer.saleStock-offer.sold+releasedSame<quantity)return NextResponse.json({error:"目标商品销售额度不足"},{status:409});
    await db.update(productOffers).set({sold:sql`max(0, ${productOffers.sold} - ${order.quantity})`,updatedAt:now}).where(and(eq(productOffers.product,order.product),eq(productOffers.region,order.region)));
    await db.update(productOffers).set({sold:sql`${productOffers.sold} + ${quantity}`,updatedAt:now}).where(eq(productOffers.id,offer.id));
    await db.update(orders).set({product,region,quantity,durationDays,amount,updatedAt:now}).where(eq(orders.id,id));
    return NextResponse.json({ok:true});
  }
  if(action==="cancel"){
    if(order.status!=="pending")return NextResponse.json({error:"只有待付款订单可以取消"},{status:409});
    const all=await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail));
    const children=order.product==="cart-bundle"?all.filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${id}`)):[];
    const stockItems=children.length?children:[order];
    await db.update(orders).set({status:"failed",updatedAt:now}).where(eq(orders.id,id));
    for(const child of children)await db.update(orders).set({status:"failed",updatedAt:now}).where(eq(orders.id,child.id));
    for(const item of stockItems)await db.update(productOffers).set({sold:sql`max(0, ${productOffers.sold} - ${item.quantity})`,updatedAt:now}).where(and(eq(productOffers.product,item.product),eq(productOffers.region,item.region)));
    return NextResponse.json({ok:true});
  }
  if(action==="confirm"){
    if(order.status!=="pending")return NextResponse.json({error:"订单不是待确认状态"},{status:409});
    await db.update(orders).set({status:"provisioning",paymentReference:String(b?.reference||"manual"),paymentMethod:String(b?.paymentMethod||"manual"),updatedAt:now}).where(eq(orders.id,id));
    if(order.product==="cart-bundle"){
      const all=await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail));
      for(const child of all.filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${id}`)))await db.update(orders).set({status:"provisioning",paymentReference:String(b?.reference||"manual"),paymentMethod:String(b?.paymentMethod||"manual"),updatedAt:now}).where(eq(orders.id,child.id));
    }
    return NextResponse.json({ok:true});
  }
  if(action==="manual-allocate"){
    if(!["paid","provisioning"].includes(order.status))return NextResponse.json({error:"只有已付款或开通中的订单可以手动交付"},{status:409});
    const host=String(b?.host||"").trim(),port=Number(b?.port),username=String(b?.username||"").trim()||null,password=String(b?.password||""),wifiName=String(b?.wifiName||"").trim()||null,protocol=String(b?.protocol||"HTTPS").toUpperCase(),country=String(b?.country||order.region).trim().toUpperCase(),city=normalizeCityName(String(b?.city||""));
    if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol)||!/^[A-Z]{2}$/.test(country)||!city)return NextResponse.json({error:"请填写有效的连接信息、国家代码和城市"},{status:400});
    const existing=await db.select().from(proxyAllocations).where(eq(proxyAllocations.orderId,id));
    if(existing.length>=order.quantity)return NextResponse.json({error:"该订单的 IP 已全部交付"},{status:409});
    if(existing.some(x=>x.host===host&&x.port===port))return NextResponse.json({error:"该 IP 和端口已在本订单中"},{status:409});
    const completes=existing.length+1>=order.quantity;
    const requestedExpiry=b?.expiresAt?adminDate(b.expiresAt):null;
    if(requestedExpiry&&Number.isNaN(requestedExpiry.getTime()))return NextResponse.json({error:"到期时间无效"},{status:400});
    const expiry=completes?(requestedExpiry||addBillingPeriod(now,order.durationDays,billingCycleFromNote(order.adminNote))):null;
    await db.insert(proxyAllocations).values({id:crypto.randomUUID(),orderId:id,host,port,username,encryptedPassword:password?await encryptCredential(password):null,wifiName,protocol,note:`[CITY]${city}\n[ACTIVATED_AT]${now.toISOString()}`,expiresAt:expiry,autoRenew:order.autoRenew,status:"active"});
    if(completes){
      await db.update(proxyAllocations).set({expiresAt:expiry,autoRenew:order.autoRenew}).where(eq(proxyAllocations.orderId,id));
      await db.update(orders).set({status:"active",region:country,expiresAt:expiry,updatedAt:now}).where(eq(orders.id,id));
      const parentId=order.adminNote?.match(/\[BUNDLE_PARENT\]([^\n]+)/)?.[1]?.trim();
      if(parentId){
        const siblings=(await db.select().from(orders).where(eq(orders.customerEmail,order.customerEmail))).filter(item=>item.adminNote?.includes(`[BUNDLE_PARENT]${parentId}`));
        if(siblings.length>0&&siblings.every(item=>item.status==="active")){
          const parentExpiry=siblings.map(item=>item.expiresAt).filter((value):value is Date=>!!value).sort((a,b)=>b.getTime()-a.getTime())[0]||expiry;
          await db.update(orders).set({status:"active",expiresAt:parentExpiry,updatedAt:now}).where(eq(orders.id,parentId));
        }
      }
    }else await db.update(orders).set({status:"provisioning",expiresAt:null,updatedAt:now}).where(eq(orders.id,id));
    return NextResponse.json({ok:true,allocated:existing.length+1,remaining:Math.max(0,order.quantity-existing.length-1),status:completes?"active":"provisioning",expiresAt:expiry});
  }
  return NextResponse.json({error:"不支持的操作"},{status:400});
}
