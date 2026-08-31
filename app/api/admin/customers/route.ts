import { NextResponse } from "next/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { customers, wallets } from "../../../../db/schema";
import { hashPassword } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { withRequestLock } from "../../../../lib/request-lock";

export async function GET(req: Request) {
  if (!await requireAdminApi("customers")) return NextResponse.json({ error: "无客户管理权限" }, { status: 403 });
  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size") || 20)));
  const searchFilter = search ? or(like(customers.email, `%${search}%`), like(customers.name, `%${search}%`)) : undefined;
  const where = searchFilter ? and(eq(customers.role, "customer"), searchFilter) : eq(customers.role, "customer");
  const items = await getDb().select({ id: customers.id, email: customers.email, name: customers.name, role: customers.role, status: customers.status, emailVerified: customers.emailVerified, createdAt: customers.createdAt, balance: wallets.balance, frozen: wallets.frozen }).from(customers).leftJoin(wallets, eq(customers.id, wallets.customerId)).where(where).orderBy(desc(customers.createdAt)).limit(size).offset((page - 1) * size);
  return NextResponse.json({ items, page, size });
}

export async function POST(req: Request) {
  const admin = await requireAdminApi("customers");
  if (!admin) return NextResponse.json({ error: "无客户管理权限" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim().slice(0, 80);
  const password = String(body?.password || "");
  const emailVerified = Boolean(body?.emailVerified);
  const status = body?.status === "suspended" ? "suspended" : "active";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "密码至少 8 位，并且需要同时包含字母和数字" }, { status: 400 });
  return withRequestLock("admin-customer-create", async () => {
    const db = getDb();
    const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
    if (existing) return NextResponse.json({ error: "该邮箱已经存在" }, { status: 409 });
    const ids = await db.select({ id: customers.id }).from(customers).where(eq(customers.role, "customer"));
    const number = ids.reduce((max, row) => { const match = row.id.match(/^user-(\d+)$/i); return match ? Math.max(max, Number(match[1])) : max; }, 0) + 1;
    const id = `user-${number}`, now = new Date();
    type BatchQuery = Parameters<typeof db.batch>[0][number];
    try {
      await db.batch([
        db.insert(customers).values({ id, email, name, passwordHash: await hashPassword(password), emailVerified, role: "customer", status, createdAt: now }),
        db.insert(wallets).values({ customerId: id, balance: 0, frozen: 0, creditLimit: 0, currency: "CNY", updatedAt: now }),
      ] as [BatchQuery, ...BatchQuery[]]);
    } catch { return NextResponse.json({ error: "客户创建失败，请检查邮箱是否重复后重试" }, { status: 409 }); }
    await audit({ id: admin.id, role: admin.role }, "customer.create", "customer", id, { email, name, emailVerified, status }, req);
    return NextResponse.json({ ok: true, customer: { id, email, name, emailVerified, status } }, { status: 201 });
  });
}
