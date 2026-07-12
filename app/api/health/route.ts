import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";

export async function GET() {
  const started = Date.now();
  let database = false;
  try {
    const result = await (env as unknown as { DB: D1Database }).DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = result?.ok === 1;
  } catch {
    database = false;
  }

  const encryptionConfigured = String(
    (env as unknown as { INVENTORY_ENCRYPTION_KEY?: string }).INVENTORY_ENCRYPTION_KEY || "",
  ).length >= 32;

  return NextResponse.json(
    {
      status: database ? "ok" : "degraded",
      service: "yehaoproxy",
      database,
      encryptionConfigured,
      paymentEnabled: false,
      emailEnabled: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    },
    { status: database ? 200 : 503 },
  );
}
