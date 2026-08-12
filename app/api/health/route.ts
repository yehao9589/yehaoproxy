import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb, getRawDatabase } from "../../../db";
import { emailProviders } from "../../../db/schema";

export async function GET() {
  const started = Date.now();
  let database = false;
  try {
    const result = await getRawDatabase().prepare("SELECT 1 AS ok").first() as { ok: number } | null;
    database = result?.ok === 1;
  } catch {
    database = false;
  }

  const encryptionConfigured = String(
    (env as unknown as { INVENTORY_ENCRYPTION_KEY?: string }).INVENTORY_ENCRYPTION_KEY || "",
  ).length >= 32;
  let emailEnabled=false;
  if(database){
    try{
      const[row]=await getDb().select().from(emailProviders).where(eq(emailProviders.id,"primary")).limit(1);
      const secretName=row?.credentialRef||"EMAIL_API_KEY";
      const runtime=env as unknown as Record<string,unknown>;
      emailEnabled=Boolean(row?.enabled&&["resend","sendgrid","smtp"].includes(row.provider)&&String(runtime[secretName]||process.env[secretName]||""));
    }catch{}
  }
  const ready=database&&encryptionConfigured;

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      service: "yehaoproxy",
      database,
      encryptionConfigured,
      paymentEnabled: false,
      emailEnabled,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    },
    { status: ready ? 200 : 503 },
  );
}
