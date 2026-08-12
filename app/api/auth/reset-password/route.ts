import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { authSessions, customers, emailVerifications } from "../../../../db/schema";
import { hashPassword, sha256 } from "../../../../lib/auth";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "");
  const password = String(body?.password || "");
  const rate = consumeRateLimit(`reset-password:${clientAddress(req)}:${email}`, 8, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "重置尝试过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code) || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return NextResponse.json({ error: "信息不完整或密码强度不足" }, { status: 400 });
  const db = getDb();
  const [verification] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.email, email), eq(emailVerifications.purpose, "reset"))).orderBy(desc(emailVerifications.createdAt)).limit(1);
  if (!verification || verification.verified || verification.expiresAt < new Date() || verification.attempts >= 5) return NextResponse.json({ error: "验证码已失效，请重新获取" }, { status: 400 });
  const valid = verification.codeHash === await sha256(`${email}:${code}`);
  const [user] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
  if (!valid || !user) {
    await db.update(emailVerifications).set({ attempts: verification.attempts + 1, verified: false }).where(eq(emailVerifications.id, verification.id));
    return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  type BatchQuery = Parameters<typeof db.batch>[0][number];
  await db.batch([
    db.update(emailVerifications).set({ attempts: verification.attempts + 1, verified: true }).where(eq(emailVerifications.id, verification.id)),
    db.update(customers).set({ passwordHash }).where(eq(customers.id, user.id)),
    db.delete(authSessions).where(eq(authSessions.customerId, user.id)),
  ] as [BatchQuery, ...BatchQuery[]]);
  return NextResponse.json({ ok: true, message: "密码已重置，请重新登录" });
}
