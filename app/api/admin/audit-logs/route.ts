import { and, desc, getTableColumns, like, not, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";

type Category = "all" | "login" | "system" | "email" | "scheduled";

const loginFilter = or(
  like(auditLogs.action, "%login%"),
  like(auditLogs.action, "%logout%"),
  like(auditLogs.action, "%session%"),
  like(auditLogs.resourceType, "%auth%"),
);
const emailFilter = or(like(auditLogs.action, "%email%"), like(auditLogs.resourceType, "%email%"));
const scheduledFilter = or(
  like(auditLogs.action, "%scheduled%"),
  like(auditLogs.action, "%cron%"),
  like(auditLogs.action, "%task%"),
  like(auditLogs.resourceType, "%scheduled%"),
);

function categoryFilter(category: Category): SQL | undefined {
  if (category === "login") return loginFilter;
  if (category === "email") return emailFilter;
  if (category === "scheduled") return scheduledFilter;
  if (category === "system") return and(not(loginFilter!), not(emailFilter!), not(scheduledFilter!));
  return undefined;
}

export async function GET(req: Request) {
  if (!await requireAdminApi("audit")) {
    return NextResponse.json({ error: "无日志查看权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const requestedCategory = url.searchParams.get("category") || "all";
  const category: Category = ["all", "login", "system", "email", "scheduled"].includes(requestedCategory)
    ? requestedCategory as Category
    : "all";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const size = Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 50)));
  const search = String(url.searchParams.get("search") || "").trim().slice(0, 100);
  const searchFilter = search
    ? or(
        like(auditLogs.actorId, `%${search}%`),
        like(auditLogs.action, `%${search}%`),
        like(auditLogs.resourceType, `%${search}%`),
        like(auditLogs.resourceId, `%${search}%`),
        like(auditLogs.ipAddress, `%${search}%`),
      )
    : undefined;
  const filter = categoryFilter(category);
  const where = filter && searchFilter ? and(filter, searchFilter) : filter || searchFilter;
  const db = getDb();

  const [items, totalRows, allRows, loginRows, emailRows, scheduledRows] = await Promise.all([
    db.select({...getTableColumns(auditLogs),logNo:sql<number>`rowid`}).from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(size).offset((page - 1) * size),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(where),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(loginFilter),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(emailFilter),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(scheduledFilter),
  ]);

  const all = Number(allRows[0]?.value || 0);
  const login = Number(loginRows[0]?.value || 0);
  const email = Number(emailRows[0]?.value || 0);
  const scheduled = Number(scheduledRows[0]?.value || 0);
  return NextResponse.json({
    items,
    page,
    size,
    total: Number(totalRows[0]?.value || 0),
    counts: { all, login, email, scheduled, system: Math.max(0, all - login - email - scheduled) },
  });
}
