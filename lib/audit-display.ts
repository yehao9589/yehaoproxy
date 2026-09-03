import { databaseText } from "./database-text";
import { countryName } from "./countries";

export type AuditDisplayLog = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  detail?: string | null;
  resourceCustomerName?: string | null;
  resourceDisplay?: string | null;
};

const actions: Record<string, string> = {
  "credit.risk_status.update":"信用风险状态自动更新","ticket.automation.close":"系统自动关闭超时工单","node.auto_renew.update":"修改节点自动续费",
  "auth.login.success":"登录成功","auth.login.failed":"登录失败","auth.logout":"退出登录",
  "email.sent":"邮件发送成功","email.failed":"邮件发送失败","email.settings.update":"修改邮件发送配置","scheduled.reminders.run":"服务提醒任务执行","scheduled.reminders.activity":"定时任务产生业务处理","scheduled.reminders.daily":"定时任务每日健康摘要","scheduled.reminders.failed":"定时任务执行失败","scheduled.reminders.manual_run":"管理员手动执行提醒任务","scheduled.runner_mode.update":"修改定时任务执行方式","scheduled.settings.update":"修改定时任务配置",
  "admin.create":"创建管理员","admin.password.update":"修改管理员密码","admin.permissions.update":"修改管理员权限",
  "customer.create":"手动创建客户","customer.update":"修改客户资料","customer.password.update":"修改客户密码","customer.credit.update":"调整客户信用额度","customer.impersonate":"管理员登录客户面板","customer.impersonation.return":"管理员结束模拟登录",
  "wallet.adjust":"客户余额调账","wallet.recharge.create":"创建余额充值订单","wallet.recharge.failed":"创建余额充值失败","credit.repayment":"偿还信用账单","order.create":"客户创建订单","order.batch_create":"客户创建合并订单","order.confirm":"确认订单收款","order.cancel":"取消订单","order.customer_cancel":"客户取消订单","order.subscription_deliver":"交付电脑节点订阅地址","order.fulfill":"发放代理资源","order.manual_allocate":"管理员手动交付资源","order.refund":"订单退款","order.update":"修改订单信息","order.service_update":"修改订单服务配置","order.amount.update":"修改待付款订单金额","order.wallet_credit_pay":"使用余额或信用额度支付订单","order.auto_extract":"自动交付代理资源","order.manual_create":"手动创建账单",
  "payment.alipay.success":"支付宝付款成功","payment.alipay.failed":"支付宝回调处理失败","payment.checkout.create":"发起外部支付","payment.gateway.create":"新增支付渠道","payment.gateway.update":"修改支付渠道","payment.gateway.delete":"删除支付渠道",
  "proxy.update":"修改代理资料","proxy.resource.update":"修改代理资源信息","proxy.resource.delete":"删除已分配资源","proxy.bulk_credentials":"批量修改代理账号密码","proxy.auto_renew.update":"修改代理自动续费","proxy.renewal_orders.create":"创建代理续费订单","proxy.bulk_renew_complete":"批量续费完成","proxy.export":"导出代理资源",
  "inventory.import":"导入代理库存","inventory.update":"修改库存资源","ticket.create":"创建客户工单","ticket.reply":"回复客户工单","ticket.customer_reply":"客户回复工单","ticket.update":"修改工单","ticket.customer_close":"客户关闭工单","ticket.automation.update":"修改工单自动化配置","ticket.automation.manual_run":"管理员手动执行工单自动化",
  "site.config.update":"修改站务配置","site.logo.upload":"上传站点 Logo","site.logo.delete":"删除站点 Logo","database.test_data.reset":"重置系统测试数据",
  "node.renewal.create":"创建节点续费订单","node.traffic_reset.order_create":"创建流量重置订单","renewal.verify.approve":"续费核验通过","renewal.verify.reject":"续费核验拒绝并退款",
  "service.reject":"拒绝售后申请并退款","service.replace.free_create":"提交免费更换 IP 申请","service.replace.order_create":"创建付费更换 IP 订单","service.replace.complete":"完成 IP 更换","service.traffic_reset.complete":"完成流量重置","service.traffic_reset.failed":"流量重置失败","service.renew.create":"提交服务续费申请","service.renew.complete":"完成服务续费","service.renew.verify":"核验服务续费结果","service.custom.complete":"完成一次性服务",
  "coupon.create":"创建优惠券","coupon.update":"修改优惠券","product.create":"新增商品","product.update":"修改商品","product.type.create":"新增商品类型","product.type.update":"修改商品类型","product.type.delete":"删除商品类型","product.policy.update":"修改商品售后规则","currency.default.update":"切换系统默认币种","expiry.policy.update":"修改过期服务策略","system.option.update":"修改系统选项","notification.sms.update":"修改短信配置","notification.templates.update":"修改客户通知模板","notification.admin_templates.update":"修改管理员通知模板","supplier.settings.update":"修改供应商配置","backup.create":"创建系统备份","backup.import":"导入系统备份","backup.delete":"删除系统备份","update.check":"检查系统更新","update.trigger":"执行系统更新","update.rollback":"回滚系统版本","update.settings.save":"保存更新设置",
  "auth.register":"客户注册成功","auth.password.reset":"客户重置密码","xpanel.server.save":"保存 VPS 面板配置","xpanel.server.delete":"删除 VPS 面板配置","xpanel.sync_all":"手动同步全部 VPS","xpanel.cycle.reset":"重置 VPS 流量周期","xpanel.traffic.calibrate":"校准 VPS 流量","xpanel.order.bind":"绑定订单与 VPS",
  "whitelist.create":"添加 IP 白名单","whitelist.delete":"删除 IP 白名单",
};

const resources: Record<string, string> = {
  auth:"账户认证",admin:"管理员账户",customer:"客户",wallet:"账户余额",credit:"信用账单",order:"订单",proxy:"代理资源",inventory:"库存资源",service_request:"售后申请",ticket:"工单",notification:"通知",email:"邮件",scheduled_task:"定时任务",database:"数据库",node:"节点服务",vps:"VPS 服务",product:"商品",product_type:"商品类型",payment_gateway:"支付渠道",supplier:"供应商",currency:"币种",settings:"系统设置",site_config:"站务配置",coupon:"优惠券",whitelist:"IP 白名单",system_backup:"系统备份",system_update:"系统更新",
};

const keys: Record<string, string> = {
  originalProduct:"原商品",previousProduct:"原商品",previousRegion:"原地区",previousQuantity:"原数量",previousDurationDays:"原服务周期",regionName:"地区名称",paymentMethod:"付款方式",referenceConfigured:"已填写收款凭证",configured:"已配置",autoRenew:"自动续费",provider:"服务商",fromName:"发件名称",fromEmail:"发件邮箱",secretUpdated:"密钥已更新",keyMaterialUpdated:"密钥已更新",keyMaterialConfigured:"密钥已配置",configurationCount:"配置项数量",endpointConfigured:"接口地址已配置",senderId:"发送方标识",mode:"执行方式",targetGb:"校准流量",succeeded:"成功数量",failed:"失败数量",idleDays:"未回复天数",walletsUpdated:"钱包币种已同步",ordersUpdated:"订单币种已同步",
  email:"邮箱",name:"名称",reason:"原因",amount:"金额",note:"备注",status:"状态",to:"收件人",subject:"标题",error:"错误信息",
  scanned:"检查数量",created:"生成通知数量",emailed:"发送邮件数量",emailFailed:"邮件失败数量",skipped:"跳过数量",requestId:"售后单号",resetOrderId:"重置账单号",paidOrderId:"付款账单号",refundedOrderId:"退款账单号",refundAmount:"退款金额",
  sourceOrderId:"原服务订单",targetOrderId:"目标订单",orderId:"订单号",orderIds:"订单列表",bundleOrderId:"合并账单号",txId:"交易流水号",transactionId:"支付流水号",tradeNo:"支付平台流水号",destination:"退款去向",
  durationDays:"服务时长",renewalDays:"续费周期",expiresAt:"到期时间",previousExpiresAt:"原到期时间",restoredExpiry:"恢复到期时间",eligibleUntil:"免费更换有效期",
  host:"代理地址",port:"端口",country:"国家或地区",city:"城市",protocol:"代理协议",previousAddress:"原代理地址",address:"新代理地址",previousCountry:"原国家或地区",previousCity:"原城市",
  payable:"支付金额",originalAmount:"原价",payAmount:"渠道支付金额",paymentCurrency:"渠道币种",couponCode:"优惠券",discount:"优惠金额",balanceAfter:"操作后余额",creditUsed:"使用信用额度",availableCredit:"可用信用额度",creditLimit:"信用额度",total:"合计金额",product:"商品",productType:"商品类型",region:"地区",quantity:"数量",count:"数量",billingCycle:"计费周期",price7:"7 天价格",price30:"1 个月 / 30 天价格",price90:"3 个月 / 90 天价格",price180:"6 个月价格",saleStock:"可售数量",sold:"已售数量",sortOrder:"排序",description:"说明",
  freeDays:"免费期限",freeCount:"免费次数",remainingFreeCount:"剩余免费次数",beforeAmount:"修改前金额",afterAmount:"修改后金额",currency:"币种",fields:"修改内容",duplicate:"是否重复通知",revokedAllocations:"停用资源数量",bundleItems:"合并订单项目数",restoredItems:"恢复库存项目数",remainingResources:"剩余资源数",requiredResources:"应交付资源数",
  currentVersion:"当前版本",currentCommit:"当前版本提交",remoteCommit:"最新版本提交",channel:"更新通道",image:"镜像地址",fileName:"备份文件",type:"类型",value:"数值",code:"优惠码",enabled:"是否启用",storage:"存储位置",size:"文件大小",permissions:"权限范围",sessionsRevoked:"其他登录会话",previousStatus:"原状态",priority:"优先级",assignedAdminId:"指派管理员",relatedService:"关联服务",internal:"内部回复",usernameChanged:"是否修改账号",passwordChanged:"是否修改密码",issues:"核验问题",manual:"处理方式",linkedBillId:"关联账单",billingMode:"计费方式",refund:"退款结果",serverId:"VPS 服务器",ip:"IP 地址",buckets:"各提醒阶段",actualAdminEmail:"实际操作管理员",impersonatedCustomerId:"被操作客户",impersonatedCustomerEmail:"被操作客户邮箱",performedViaImpersonation:"模拟客户操作",allocated:"已交付数量",required:"应交付数量",completed:"是否完成交付",wifiName:"WiFi 名称",
};

const values: Record<string, string> = {
  CNY:"人民币（CNY）",USD:"美元（USD）",EUR:"欧元（EUR）",GBP:"英镑（GBP）",JPY:"日元（JPY）",
  balance:"退至客户余额",original:"原支付渠道退款",active:"已开通",pending:"待处理",paid:"已支付",provisioning:"开通处理中",refunded:"已退款",failed:"失败",cancelled:"已取消",canceled:"已取消",suspended:"已停用",
  percent:"按百分比折扣",fixed:"固定金额折扣",recurring:"周期服务",one_time:"一次性服务","one-time":"一次性服务",
  "pre-release":"预发布通道",stable:"稳定通道",filesystem:"服务器本地存储","image/png":"PNG 图片","image/jpeg":"JPEG 图片","image/webp":"WEBP 图片",
  "static-isp":"静态住宅 IP",residential:"动态住宅代理",datacenter:"数据中心代理","computer-node":"电脑节点","soft-router":"软路由中转",
  proxy:"代理 IP",node:"节点服务",open:"处理中",waiting_customer:"等待客户回复",waiting_staff:"等待客服处理",resolved:"已解决",closed:"已关闭",
  "calendar-month":"自然月计费","fixed-days":"固定天数计费",GLOBAL:"全局节点",MULTI:"多个地区",
  true:"是",false:"否",
};

const configurationNames:Record<string,string>={
  nodeTrafficResetPrice:"节点流量重置价格",
  ipReplacementPrice:"付费更换 IP 价格",
  ipReplacementFreeDays:"免费更换 IP 有效天数",
  ipReplacementFreeCount:"免费更换 IP 次数",
  customer_node_credential_editing:"客户修改代理账号密码权限",
};

const permissionNames: Record<string, string> = {overview:"运营概览",orders:"订单管理",products:"商品管理",customers:"客户管理",finance:"财务运营",sales:"销售业绩",tickets:"工单管理",coupons:"优惠券",requests:"售后申请",automation:"定时任务",settings:"系统设置",admins:"管理员账户",audit:"审计日志"};
const hiddenKeys = new Set(["allocationId","allocationIds","resourceId","resourceIds","passwordHash","encryptedPassword","password","token","tokenHash","credentialRef","appPrivateKey","alipayPublicKey","privateKey","secret"]);

function isEncodedBytes(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 && value.every(item => Number.isInteger(Number(item)) && Number(item) >= 0 && Number(item) <= 255);
  if (!value || typeof value !== "object") return false;
  const record=value as Record<string,unknown>;
  return Array.isArray(record.data) || Object.keys(record).some(key => /^\d+$/.test(key));
}

function looksUnreadable(text: string) {
  return /\uFFFD/.test(text) || /(?:Ã.|Â.|å.|æ.|ç.){3,}/.test(text);
}

function noteText(input: string) {
  const extra:string[]=[];
  const visible=input.replace(/\[([A-Z_]+)\]([^\[]*)/g,(_,key:string,raw:string)=>{
    const value=raw.trim();
    if(key==="CITY"&&value)extra.push(`城市：${value}`);
    if(key==="ACTIVATED_AT"&&value){const date=new Date(value);extra.push(`开通时间：${Number.isNaN(date.getTime())?"历史时间未识别":date.toLocaleString("zh-CN",{hour12:false})}`)}
    return "";
  }).trim();
  return [visible,...extra].filter(Boolean).join("；")||"无";
}

function displayValue(key:string,value:unknown):string {
  if(value===null||value===undefined||value==="")return"无";
  if(typeof value==="boolean")return value?"是":"否";
  if(isEncodedBytes(value))return displayValue(key,databaseText(value));
  if(Array.isArray(value)){
    if(key==="permissions")return value.map(item=>permissionNames[String(item)]||"其他权限").join("、")||"无";
    return value.length?value.map(item=>displayValue(key,item)).join("、"):"无";
  }
  if(typeof value==="object")return"配置内容已更新";
  let text=String(value).trim();
  if(key==="note")return noteText(text);
  if(configurationNames[text]!==undefined)return configurationNames[text];
  if(values[text]!==undefined)return values[text];
  if(["region","previousRegion","country","previousCountry"].includes(key))return countryName(text);
  if(["price7","price30","price90","price180"].includes(key)&&text==="-1")return"不出售";
  if(key==="enabled")return text==="1"?"是":text==="0"?"否":text;
  if(key==="size"&&/^\d+$/.test(text)){const bytes=Number(text);return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(2)} MB`:bytes>=1024?`${(bytes/1024).toFixed(1)} KB`:`${bytes} 字节`}
  if(["durationDays","renewalDays","freeDays"].includes(key)&&/^\d+(?:\.\d+)?$/.test(text))return`${text} 天`;
  if(["currentCommit","remoteCommit"].includes(key)&&/^[0-9a-f]{12,}$/i.test(text))return text.slice(0,8).toUpperCase();
  if(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text))return"内部记录";
  if(/^\d{4}-\d{2}-\d{2}T/.test(text)){const date=new Date(text);if(!Number.isNaN(date.getTime()))return date.toLocaleString("zh-CN",{hour12:false})}
  if(looksUnreadable(text))return"历史记录内容无法识别";
  text=text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
  return text||"无";
}

export function auditActionName(action:string) {
  if(actions[action])return actions[action];
  const verbs:Record<string,string>={create:"创建",update:"修改",delete:"删除",login:"登录",logout:"退出",reply:"回复",approve:"批准",reject:"拒绝",refund:"退款",cancel:"取消",confirm:"确认",complete:"完成",import:"导入",adjust:"调账",sent:"发送成功",failed:"失败",run:"执行",request:"申请",pay:"支付",fulfill:"发放",replace:"更换",renew:"续费",upload:"上传",check:"检查",trigger:"执行",rollback:"回滚",export:"导出",verify:"核验"};
  const translated=action.split(".").map(part=>verbs[part]||resources[part]).filter(Boolean);
  return translated.length?[...new Set(translated)].join(" · "):"系统操作";
}

export function auditResourceName(resourceType:string){return resources[resourceType]||"系统记录"}

export function auditDetailText(raw:string|null|undefined,resourceType="") {
  if(!raw)return"";
  try{
    const data=JSON.parse(raw) as Record<string,unknown>;
    if(!data||typeof data!=="object"||Array.isArray(data))return"操作详情已记录";
    if(resourceType==="email"&&(data.to!==undefined||data.subject!==undefined))return`${displayValue("to",data.to)} · ${displayValue("subject",data.subject)}`;
    const parts=Object.entries(data)
      .filter(([key,value])=>!hiddenKeys.has(key)&&value!==null&&value!==undefined&&value!=="")
      .map(([key,value])=>({label:keys[key]||"补充说明",value:displayValue(key,value)}))
      .filter(item=>item.value!=="内部记录")
      .slice(0,8)
      .map(item=>`${item.label}：${item.value}`);
    return parts.join("；");
  }catch{return"历史日志详情无法识别"}
}

export function auditObjectName(log:AuditDisplayLog) {
  if(log.resourceType==="customer"&&log.resourceCustomerName)return`客户 ${log.resourceCustomerName}`;
  if(log.resourceType==="proxy"&&log.resourceDisplay)return`代理资源 ${log.resourceDisplay}`;
  const base=auditResourceName(log.resourceType),id=String(log.resourceId||"");
  if(!id)return base;
  if(log.resourceType==="order")return`${base} ${id}`;
  if(["ticket","service_request"].includes(log.resourceType)&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return`${base} ${id}`;
  return `${base}记录`;
}
