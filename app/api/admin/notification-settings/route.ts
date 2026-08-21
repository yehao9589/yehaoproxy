import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {emailProviders, systemOptions} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {setSystemOption} from "../../../../lib/db-upsert";

export const DEFAULT_TEMPLATES = [
  {id: "register_code", name: "注册验证码", scene: "账户安全", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "注册验证码", emailBody: "你的验证码是：{{code}}，10 分钟内有效。", smsBody: "【YehaoProxy】注册验证码：{{code}}，10分钟内有效。"},
  {id: "reset_password", name: "重置密码验证码", scene: "账户安全", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "重置密码验证码", emailBody: "你的重置密码验证码是：{{code}}，10 分钟内有效。", smsBody: "【YehaoProxy】重置密码验证码：{{code}}，10分钟内有效。"},
  {id: "new_order", name: "新购服务已受理", scene: "订单通知", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "新购服务已受理", emailBody: "订单 {{orderId}}（{{product}}）已付款，正在等待开通。", smsBody: "【YehaoProxy】订单{{orderId}}已付款，正在等待开通。"},
  {id: "provisioning", name: "等待人工开通", scene: "交付通知", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "服务正在等待人工开通", emailBody: "订单 {{orderId}} 已进入人工开通流程，我们会尽快完成交付。", smsBody: "【YehaoProxy】订单{{orderId}}正在人工开通，请留意后续通知。"},
  {id: "expiry", name: "服务即将到期", scene: "到期提醒", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "服务将在 {{days}} 天后到期", emailBody: "订单 {{orderId}} 将于 {{expiresAt}} 到期，请及时续费。", smsBody: "【YehaoProxy】订单{{orderId}}将在{{days}}天后到期，请及时续费。"},
  {id: "expired", name: "服务已到期", scene: "到期提醒", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "服务已到期", emailBody: "订单 {{orderId}} 已经到期，请续费后继续使用。", smsBody: "【YehaoProxy】订单{{orderId}}已到期，请登录客户中心续费。"},
  {id: "renewed", name: "续费成功提醒", scene: "续费通知", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "服务续费成功", emailBody: "订单 {{orderId}} 已续费成功，新的到期时间为 {{expiresAt}}。", smsBody: "【YehaoProxy】订单{{orderId}}已续费成功。"},
  {id: "after_sale", name: "售后申请进度", scene: "售后通知", enabled: true, emailEnabled: true, smsEnabled: false, emailSubject: "售后申请状态更新", emailBody: "订单 {{orderId}} 的售后申请状态已更新，请登录客户中心查看。", smsBody: "【YehaoProxy】订单{{orderId}}的售后申请状态已更新。"},
];

export const DEFAULT_ADMIN_TEMPLATES = [
  {id:"admin_new_order",name:"客户新购提醒",scene:"订单运营",enabled:true,emailEnabled:true,smsEnabled:false,emailSubject:"收到新订单 {{orderId}}",emailBody:"客户 {{customerEmail}} 创建了 {{product}} 订单，地区 {{region}}，数量 {{quantity}}，金额 {{amount}}。",smsBody:""},
  {id:"admin_renewal",name:"客户续费提醒",scene:"续费核验",enabled:true,emailEnabled:true,smsEnabled:false,emailSubject:"收到续费订单 {{orderId}}",emailBody:"客户 {{customerEmail}} 提交了续费订单，原服务 {{sourceOrderId}}，续费周期 {{durationLabel}}，金额 {{amount}}。",smsBody:""},
  {id:"admin_stock_low",name:"库存不足提醒",scene:"库存预警",enabled:true,emailEnabled:true,smsEnabled:false,emailSubject:"商品库存不足：{{product}} / {{region}}",emailBody:"客户下单时库存不足。商品 {{product}}，地区 {{region}}，需要 {{required}}，当前可用 {{available}}。",smsBody:""},
];

type NotificationTemplateInput = {
  id?: unknown;
  name?: unknown;
  scene?: unknown;
  enabled?: unknown;
  emailEnabled?: unknown;
  smsEnabled?: unknown;
  emailSubject?: unknown;
  emailBody?: unknown;
  smsBody?: unknown;
};

type NotificationSettingsInput = {
  kind?: unknown;
  provider?: unknown;
  enabled?: unknown;
  signName?: unknown;
  credentialRef?: unknown;
  secretRef?: unknown;
  region?: unknown;
  endpoint?: unknown;
  senderId?: unknown;
  templates?: NotificationTemplateInput[];
};

export async function GET() {
  if (!await requireAdminApi("settings")) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const db = getDb();
  const [[email], optionRows] = await Promise.all([
    db.select().from(emailProviders).where(eq(emailProviders.id, "primary")).limit(1),
    db.select().from(systemOptions),
  ]);
  const options = Object.fromEntries(optionRows.map(item => [item.key, item.value]));
  let sms = null;
  let templates = DEFAULT_TEMPLATES;
  let adminTemplates = DEFAULT_ADMIN_TEMPLATES;
  try { sms = options.sms_provider_config ? JSON.parse(options.sms_provider_config) : null; } catch {}
  try { templates = options.notification_templates ? JSON.parse(options.notification_templates) : DEFAULT_TEMPLATES; } catch {}
  try { adminTemplates = options.admin_notification_templates ? JSON.parse(options.admin_notification_templates) : DEFAULT_ADMIN_TEMPLATES; } catch {}
  return NextResponse.json({email, sms, templates, adminTemplates});
}

export async function POST(request: Request) {
  if (!await requireAdminApi("settings")) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const body = await request.json().catch(() => null) as NotificationSettingsInput | null;
  const now = new Date();
  if (body?.kind === "sms") {
    if (!["aliyun", "tencent", "twilio", "generic"].includes(String(body.provider))) return NextResponse.json({error: "短信服务商无效"}, {status: 400});
    const config = {
      provider: String(body.provider),
      enabled: Boolean(body.enabled),
      signName: String(body.signName || ""),
      credentialRef: String(body.credentialRef || "SMS_API_KEY"),
      secretRef: String(body.secretRef || "SMS_API_SECRET"),
      region: String(body.region || ""),
      endpoint: String(body.endpoint || ""),
      senderId: String(body.senderId || ""),
    };
    if(config.enabled)return NextResponse.json({error:"短信发送适配器尚未实现，当前只能保存停用配置"},{status:409});
    await setSystemOption("sms_provider_config",JSON.stringify(config),now);
    return NextResponse.json({ok: true, config});
  }
  if (body?.kind === "templates") {
    if (!Array.isArray(body.templates) || !body.templates.length) return NextResponse.json({error: "模板数据无效"}, {status: 400});
    if(body.templates.some(item=>item?.smsEnabled===true))return NextResponse.json({error:"短信发送适配器尚未实现，模板暂不能启用短信通道"},{status:409});
    const templates = body.templates.map(item => ({
      id: String(item.id),
      name: String(item.name).slice(0, 50),
      scene: String(item.scene).slice(0, 30),
      enabled: item.enabled !== false,
      emailEnabled: item.emailEnabled !== false,
      smsEnabled: item.smsEnabled === true,
      emailSubject: String(item.emailSubject).slice(0, 100),
      emailBody: String(item.emailBody).slice(0, 5000),
      smsBody: String(item.smsBody).slice(0, 500),
    }));
    await setSystemOption("notification_templates",JSON.stringify(templates),now);
    return NextResponse.json({ok: true, templates});
  }
  if (body?.kind === "admin-templates") {
    if (!Array.isArray(body.templates) || !body.templates.length) return NextResponse.json({error:"管理员模板数据无效"},{status:400});
    const templates=body.templates.map(item=>({id:String(item.id),name:String(item.name).slice(0,50),scene:String(item.scene).slice(0,30),enabled:item.enabled!==false,emailEnabled:item.emailEnabled!==false,smsEnabled:false,emailSubject:String(item.emailSubject).slice(0,100),emailBody:String(item.emailBody).slice(0,5000),smsBody:""}));
    await setSystemOption("admin_notification_templates",JSON.stringify(templates),now);
    return NextResponse.json({ok:true,templates});
  }
  return NextResponse.json({error: "通知配置类型无效"}, {status: 400});
}
