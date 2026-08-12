import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { emailVerifications } from "../../../../db/schema";
import { sha256 } from "../../../../lib/auth";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "");
  const rate = consumeRateLimit(`verify-code:${clientAddress(req)}:${email}`, 10, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "验证尝试过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "验证码格式不正确" }, { status: 400 });
  const db = getDb();
  const [record] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.email, email), eq(emailVerifications.purpose, "register"))).orderBy(desc(emailVerifications.createdAt)).limit(1);
  if (!record || record.verified || record.expiresAt < new Date()) return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
  if (record.attempts >= 5) return NextResponse.json({ error: "尝试次数过多，请重新获取" }, { status: 429 });
  const valid = record.codeHash === await sha256(`${email}:${code}`);
  await db.update(emailVerifications).set({ attempts: record.attempts + 1, verified: valid }).where(eq(emailVerifications.id, record.id));
  if (!valid) return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
  return NextResponse.json({ ok: true, verified: true });
}
