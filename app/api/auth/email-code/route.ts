import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { customers, emailVerifications } from "../../../../db/schema";
import { sha256 } from "../../../../lib/auth";
import { sendVerificationEmail } from "../../../../lib/email";
import { clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const purpose = body?.purpose === "reset" ? "reset" : "register";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  const rate = consumeRateLimit(`email-code:${clientAddress(req)}:${email}`, 5, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "发送过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  const db = getDb();
  const [last] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.email, email), eq(emailVerifications.purpose, purpose))).orderBy(desc(emailVerifications.createdAt)).limit(1);
  if (last && Date.now() - last.createdAt.getTime() < 60_000) return NextResponse.json({ error: "发送过于频繁，请 60 秒后再试" }, { status: 429 });
  const [account] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
  if (purpose === "register" && account) return NextResponse.json({ error: "该邮箱已经注册" }, { status: 409 });
  if (purpose === "reset" && !account) return NextResponse.json({ ok: true, message: "如果该邮箱已注册，验证码将发送到邮箱" });
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
  const now = new Date();
  try { await sendVerificationEmail(email, code, purpose); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "邮件发送失败" }, { status: 503 }); }
  await db.insert(emailVerifications).values({ id: crypto.randomUUID(), email, codeHash: await sha256(`${email}:${code}`), purpose, attempts: 0, verified: false, expiresAt: new Date(now.getTime() + 600_000), createdAt: now });
  return NextResponse.json({ ok: true, message: "验证码已发送" });
}
