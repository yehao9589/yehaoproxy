import{NextResponse}from"next/server";
import{and,eq,sql}from"drizzle-orm";
import{requireAdminApi}from"../../../../../lib/admin-auth";
import{getDb}from"../../../../../db";
import{customers,inventory,orders,paymentTransactions,productOffers,proxyAllocations}from"../../../../../db/schema";
import{encryptCredential}from"../../../../../lib/inventory-crypto";

export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const{id}=await params,db=getDb(),[order]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  const[customer]=await db.select({id:customers.id,email:customers.email,name:customers.name,status:customers.status}).from(customers).where(eq(customers.email,order.customerEmail)).limit(1);
  const allocations=await db.select().from(proxyAllocations).where(eq(proxyAllocations.orderId,id));
  const payments=await db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId,id));
  return NextResponse.json({order,customer:customer||null,allocations,payments});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!await requireAdminApi())return NextResponse.json({error:"无管理员权限"},{status:403});
  const{id}=await params,b=await req.json().catch(()=>null),action=String(b?.action||""),db=getDb();
  const[order]=await db.select().from(orders).where(eq(orders.id,id)).limit(1);
  if(!order)return NextResponse.json({error:"订单不存在"},{status:404});
  const now=new Date();
  if(action==="service-update"){
    const paymentMethod=String(b?.paymentMethod||"balance"),expiresAt=b?.expiresAt?new Date(String(b.expiresAt)):null,renewalAmount=b?.renewalAmount===""||b?.renewalAmount==null?null:Number(b.renewalAmount),autoRenew=b?.autoRenew===true||b?.autoRenew==="true"||b?.autoRenew==="on",adminNote=String(b?.adminNote||"").slice(0,1000),nextStatus=String(b?.status||order.status);
    if(!["balance","manual","alipay","wechat","paypal","usdt","bank"].includes(paymentMethod)||expiresAt&&Number.isNaN(expiresAt.getTime())||renewalAmount!==null&&(!Number.isFinite(renewalAmount)||renewalAmount<0)||!["pending","paid","provisioning","active","refunded","failed"].includes(nextStatus))return NextResponse.json({error:"服务或财务信息无效"},{status:400});
    await db.update(orders).set({paymentMethod,expiresAt,renewalAmount,autoRenew,adminNote,status:nextStatus as typeof order.status,updatedAt:now}).where(eq(orders.id,id));
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
    if(offer.saleStock-offer.sold+releasedSame<quantity)return NextResponse.json({error:"目标商品销售额度不足"},{status:409});
    await db.update(productOffers).set({sold:sql`max(0, ${productOffers.sold} - ${order.quantity})`,updatedAt:now}).where(and(eq(productOffers.product,order.product),eq(productOffers.region,order.region)));
    await db.update(productOffers).set({sold:sql`${productOffers.sold} + ${quantity}`,updatedAt:now}).where(eq(productOffers.id,offer.id));
    await db.update(orders).set({product,region,quantity,durationDays,amount,updatedAt:now}).where(eq(orders.id,id));
    return NextResponse.json({ok:true});
  }
  if(action==="cancel"){
    if(order.status!=="pending")return NextResponse.json({error:"只有待付款订单可以取消"},{status:409});
    await db.update(orders).set({status:"failed",updatedAt:now}).where(eq(orders.id,id));
    await db.update(productOffers).set({sold:sql`max(0, ${productOffers.sold} - ${order.quantity})`,updatedAt:now}).where(and(eq(productOffers.product,order.product),eq(productOffers.region,order.region)));
    return NextResponse.json({ok:true});
  }
  if(action==="confirm"){
    if(order.status!=="pending")return NextResponse.json({error:"订单不是待确认状态"},{status:409});
    await db.update(orders).set({status:"paid",paymentReference:String(b?.reference||"manual"),paymentMethod:String(b?.paymentMethod||"manual"),updatedAt:now}).where(eq(orders.id,id));
    return NextResponse.json({ok:true});
  }
  if(action==="manual-allocate"){
    if(!["paid","provisioning"].includes(order.status))return NextResponse.json({error:"只有已付款或开通中的订单可以手动交付"},{status:409});
    const host=String(b?.host||"").trim(),port=Number(b?.port),username=String(b?.username||"").trim()||null,password=String(b?.password||""),protocol=String(b?.protocol||"HTTPS").toUpperCase();
    if(!host||!Number.isInteger(port)||port<1||port>65535||!["HTTP","HTTPS","SOCKS5"].includes(protocol))return NextResponse.json({error:"IP、端口或协议不正确"},{status:400});
    const existing=await db.select().from(proxyAllocations).where(eq(proxyAllocations.orderId,id));
    if(existing.length>=order.quantity)return NextResponse.json({error:"该订单的 IP 已全部交付"},{status:409});
    if(existing.some(x=>x.host===host&&x.port===port))return NextResponse.json({error:"该 IP 和端口已在本订单中"},{status:409});
    const completes=existing.length+1>=order.quantity;
    const expiry=completes?new Date(now.getTime()+order.durationDays*86400000):null;
    await db.insert(proxyAllocations).values({id:crypto.randomUUID(),orderId:id,host,port,username,encryptedPassword:password?await encryptCredential(password):null,protocol,expiresAt:expiry,autoRenew:order.autoRenew,status:"active"});
    if(completes){
      await db.update(proxyAllocations).set({expiresAt:expiry,autoRenew:order.autoRenew}).where(eq(proxyAllocations.orderId,id));
      await db.update(orders).set({status:"active",expiresAt:expiry,updatedAt:now}).where(eq(orders.id,id));
    }else await db.update(orders).set({status:"provisioning",expiresAt:null,updatedAt:now}).where(eq(orders.id,id));
    return NextResponse.json({ok:true,allocated:existing.length+1,remaining:Math.max(0,order.quantity-existing.length-1),status:completes?"active":"provisioning",expiresAt:expiry});
  }
  if(action==="fulfill"){
    if(!["paid","provisioning"].includes(order.status))return NextResponse.json({error:"订单尚未付款或已经完成"},{status:409});
    const existing=await db.select().from(proxyAllocations).where(eq(proxyAllocations.orderId,id));
    const needed=Math.max(0,order.quantity-existing.length);
    if(!needed)return NextResponse.json({error:"该订单已经全部交付"},{status:409});
    const stock=await db.select().from(inventory).where(and(eq(inventory.product,order.product),eq(inventory.country,order.region),eq(inventory.status,"available"))).limit(needed);
    if(stock.length!==needed)return NextResponse.json({error:`真实 IP 库存不足：还需要 ${needed} 条，当前 ${stock.length} 条。`},{status:409});
    const expiry=order.expiresAt||new Date(now.getTime()+order.durationDays*86400000);
    for(const item of stock){await db.insert(proxyAllocations).values({id:crypto.randomUUID(),orderId:id,host:item.host,port:item.port,username:item.username,encryptedPassword:item.encryptedPassword,protocol:item.protocol,expiresAt:expiry,autoRenew:order.autoRenew,status:"active"});await db.update(inventory).set({status:"allocated",reservedByOrderId:id,updatedAt:now}).where(and(eq(inventory.id,item.id),eq(inventory.status,"available")))}
    await db.update(proxyAllocations).set({expiresAt:expiry,autoRenew:order.autoRenew}).where(eq(proxyAllocations.orderId,id));
    await db.update(orders).set({status:"active",expiresAt:expiry,updatedAt:new Date()}).where(eq(orders.id,id));
    return NextResponse.json({ok:true,allocated:stock.length});
  }
  return NextResponse.json({error:"不支持的操作"},{status:400});
}
