import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customers } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { hashPassword } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";

export async function GET() {
  if (!await requireAdminApi()) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const items = await getDb().select({ id: customers.id, email: customers.email, name: customers.name, status: customers.status, createdAt: customers.createdAt }).from(customers).where(eq(customers.role, "admin")).orderBy(desc(customers.createdAt));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const operator = await requireAdminApi();
  if (!operator) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");
  if (!email || password.length < 8) return NextResponse.json({ error: "请输入管理员账号，密码至少 8 位" }, { status: 400 });
  const db = getDb();
  if ((await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1))[0]) return NextResponse.json({ error: "账号已存在" }, { status: 409 });
  const id = crypto.randomUUID();
  await db.insert(customers).values({ id, email, name: name || null, passwordHash: await hashPassword(password), emailVerified: true, role: "admin", status: "active", createdAt: new Date() });
  await audit({ id: operator.id, role: operator.role }, "admin.create", "admin", id, { email }, req);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
