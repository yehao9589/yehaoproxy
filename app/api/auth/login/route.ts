import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { customers } from "../../../../db/schema";
import { audit } from "../../../../lib/audit";
import { createSession, verifyPassword } from "../../../../lib/auth";
import { clearRateLimit, clientAddress, consumeRateLimit } from "../../../../lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const rateKey = `login:${clientAddress(req)}:${email}`;
  const rate = consumeRateLimit(rateKey, 8, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "登录尝试过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  const [customer] = await getDb().select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer?.passwordHash || !await verifyPassword(password, customer.passwordHash)) {
    await audit({ id: email || "unknown", role: "customer" }, "auth.login.failed", "auth", null, { email }, req);
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }
  if (customer.status !== "active") {
    await audit({ id: customer.id, role: customer.role }, "auth.login.failed", "auth", customer.id, { reason: "账户已停用" }, req);
    return NextResponse.json({ error: "账户已被停用" }, { status: 403 });
  }
  clearRateLimit(rateKey);
  const session = await createSession(customer.id, req);
  await audit({ id: customer.id, role: customer.role }, "auth.login.success", "auth", customer.id, { email: customer.email }, req);
  const response = NextResponse.json({ ok: true, role: customer.role });
  response.cookies.set("yh_session", session.token, { httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "lax", path: "/", expires: session.expires });
  return response;
}
