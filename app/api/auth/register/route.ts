import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { customers, emailVerifications } from "../../../../db/schema";
import { createSession, hashPassword, sha256 } from "../../../../lib/auth";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";
import { withRequestLock } from "../../../../lib/request-lock";
import { audit } from "../../../../lib/audit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const code = String(body?.code || "");
  const name = String(body?.name || "").trim().slice(0, 80);
  const rate = consumeRateLimit(`register:${clientAddress(req)}:${email}`, 8, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "注册尝试过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "注册信息不完整或密码强度不足" }, { status: 400 });

  return withRequestLock("customer-registration", async () => {
    const db = getDb();
    const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (existing) return NextResponse.json({ error: "该邮箱已经注册" }, { status: 409 });
    const [verification] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.email, email), eq(emailVerifications.purpose, "register"))).orderBy(desc(emailVerifications.createdAt)).limit(1);
    if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) return NextResponse.json({ error: "验证码不正确或已过期" }, { status: 400 });
    const validCode = verification.codeHash === await sha256(`${email}:${code}`);
    if (!validCode) {
      await db.update(emailVerifications).set({ attempts: verification.attempts + 1, verified: false }).where(eq(emailVerifications.id, verification.id));
      return NextResponse.json({ error: "验证码不正确或已过期" }, { status: 400 });
    }
    const customerIds = await db.select({ id: customers.id }).from(customers).where(eq(customers.role, "customer"));
    const nextNumber = customerIds.reduce((maximum, row) => {
      const match = row.id.match(/^user-(\d+)$/i);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    const id = `user-${nextNumber}`;
    const passwordHash = await hashPassword(password);
    type BatchQuery = Parameters<typeof db.batch>[0][number];
    try {
      await db.batch([
        db.insert(customers).values({ id, email, name, passwordHash, emailVerified: true, role: "customer", status: "active", createdAt: new Date() }),
        db.update(emailVerifications).set({ attempts: verification.attempts + 1, verified: true }).where(eq(emailVerifications.id, verification.id)),
      ] as [BatchQuery, ...BatchQuery[]]);
    } catch {
      const [duplicate] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
      return NextResponse.json({ error: duplicate ? "该邮箱已经注册" : "客户编号生成冲突，请重试" }, { status: 409 });
    }
    const session = await createSession(id, req);
    await audit({id,role:"customer"},"auth.register","customer",id,{email,name},req);
    const response = NextResponse.json({ ok: true, customer: { id, email, name } }, { status: 201 });
    response.cookies.set("yh_session", session.token, { httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "lax", path: "/", expires: session.expires });
    return response;
  });
}
