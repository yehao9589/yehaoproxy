import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {emailProviders} from "../../../../db/schema";
import {requireAdminApi} from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  if (!await requireAdminApi("settings")) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const body = await request.json().catch(() => null);
  if (!body || !["smtp", "resend", "ses", "aliyun"].includes(body.provider) || !body.fromName || !/^\S+@\S+\.\S+$/.test(body.fromEmail)) {
    return NextResponse.json({error: "邮件配置不完整"}, {status: 400});
  }
  const now = new Date();
  await getDb().insert(emailProviders).values({
    id: "primary",
    provider: body.provider,
    enabled: Boolean(body.enabled),
    fromName: String(body.fromName),
    fromEmail: String(body.fromEmail),
    host: body.host ? String(body.host) : null,
    port: body.port ? Number(body.port) : null,
    username: body.username ? String(body.username) : null,
    credentialRef: body.credentialRef ? String(body.credentialRef) : null,
    region: body.region ? String(body.region) : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: emailProviders.id,
    set: {
      provider: body.provider,
      enabled: Boolean(body.enabled),
      fromName: String(body.fromName),
      fromEmail: String(body.fromEmail),
      host: body.host ? String(body.host) : null,
      port: body.port ? Number(body.port) : null,
      username: body.username ? String(body.username) : null,
      credentialRef: body.credentialRef ? String(body.credentialRef) : null,
      region: body.region ? String(body.region) : null,
      updatedAt: now,
    },
  });
  return NextResponse.json({ok: true});
}

export async function GET() {
  if (!await requireAdminApi("settings")) return NextResponse.json({error: "无系统设置权限"}, {status: 403});
  const [row] = await getDb().select().from(emailProviders).where(eq(emailProviders.id, "primary")).limit(1);
  return NextResponse.json(row || null);
}
