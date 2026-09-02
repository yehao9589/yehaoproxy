import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {emailProviders} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {upsertRecord} from "../../../../lib/db-upsert";
import {encryptCredential} from "../../../../lib/inventory-crypto";
import {audit} from "../../../../lib/audit";

export async function POST(request: Request) {
  const admin=await requireAdminApi("settings");
  if (!admin) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const body = await request.json().catch(() => null);
  if (!body || !["smtp", "resend", "sendgrid"].includes(body.provider) || !body.fromName || !/^\S+@\S+\.\S+$/.test(body.fromEmail)) {
    return NextResponse.json({error: "邮件配置不完整"}, {status: 400});
  }
  if(body.enabled&&!["resend","sendgrid","smtp"].includes(body.provider))return NextResponse.json({error:"该邮件服务商暂不支持启用"},{status:409});
  const [current]=await getDb().select().from(emailProviders).where(eq(emailProviders.id,"primary")).limit(1);
  const suppliedSecret=String(body.secret||"").trim(),credentialRef=suppliedSecret?await encryptCredential(suppliedSecret):current?.credentialRef||null;
  if(body.provider==="smtp"&&(!body.host||!Number.isInteger(Number(body.port))||Number(body.port)<1||Number(body.port)>65535||!body.username||!credentialRef))return NextResponse.json({error:"SMTP 需要填写服务器、端口、账号和授权码"},{status:400});
  if(["resend","sendgrid"].includes(body.provider)&&!credentialRef)return NextResponse.json({error:"请填写 API Key"},{status:400});
  const now = new Date();
  const values={
    id: "primary",
    provider: body.provider,
    enabled: Boolean(body.enabled),
    fromName: String(body.fromName),
    fromEmail: String(body.fromEmail),
    host: body.host ? String(body.host) : null,
    port: body.port ? Number(body.port) : null,
    username: body.username ? String(body.username) : null,
    credentialRef,
    region: body.region ? String(body.region) : null,
    updatedAt: now,
  };
  await upsertRecord(emailProviders,emailProviders.id,"primary",values,{
      provider: body.provider,
      enabled: Boolean(body.enabled),
      fromName: String(body.fromName),
      fromEmail: String(body.fromEmail),
      host: body.host ? String(body.host) : null,
      port: body.port ? Number(body.port) : null,
      username: body.username ? String(body.username) : null,
      credentialRef,
      region: body.region ? String(body.region) : null,
      updatedAt: now,
  });
  await audit(admin,"email.settings.update","email","primary",{provider:body.provider,enabled:Boolean(body.enabled),fromName:String(body.fromName),fromEmail:String(body.fromEmail),host:body.host?String(body.host):null,port:body.port?Number(body.port):null,username:body.username?String(body.username):null,keyMaterialUpdated:Boolean(suppliedSecret),region:body.region?String(body.region):null},request);
  return NextResponse.json({ok: true});
}

export async function GET() {
  if (!await requireAdminApi("settings")) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const [row] = await getDb().select().from(emailProviders).where(eq(emailProviders.id, "primary")).limit(1);
  return NextResponse.json(row?{...row,credentialRef:undefined,credentialConfigured:Boolean(row.credentialRef)}:null);
}
