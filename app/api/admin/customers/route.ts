import { NextResponse } from "next/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { getDb } from "../../../../db";
import { customers, wallets } from "../../../../db/schema";

export async function GET(req: Request) {
  if (!await requireAdminApi()) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size") || 20)));
  const searchFilter = search ? or(like(customers.email, `%${search}%`), like(customers.name, `%${search}%`)) : undefined;
  const where = searchFilter ? and(eq(customers.role, "customer"), searchFilter) : eq(customers.role, "customer");
  const items = await getDb().select({ id: customers.id, email: customers.email, name: customers.name, role: customers.role, status: customers.status, emailVerified: customers.emailVerified, createdAt: customers.createdAt, balance: wallets.balance, frozen: wallets.frozen }).from(customers).leftJoin(wallets, eq(customers.id, wallets.customerId)).where(where).orderBy(desc(customers.createdAt)).limit(size).offset((page - 1) * size);
  return NextResponse.json({ items, page, size });
}
