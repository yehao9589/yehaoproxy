import { and, desc, getTableColumns, inArray, like, not, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { auditLogs, customers, proxyAllocations } from "../../../../db/schema";
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
  const db = getDb();
  const matchedCustomers=search?await db.select({id:customers.id}).from(customers).where(or(like(customers.name,`%${search}%`),like(customers.email,`%${search}%`),like(customers.id,`%${search}%`))):[];
  const matchedCustomerIds=matchedCustomers.map(customer=>customer.id);
  const searchFilter = search
    ? or(
        like(auditLogs.actorId, `%${search}%`),
        like(auditLogs.action, `%${search}%`),
        like(auditLogs.resourceType, `%${search}%`),
        like(auditLogs.resourceId, `%${search}%`),
        like(auditLogs.detail, `%${search}%`),
        like(auditLogs.ipAddress, `%${search}%`),
        matchedCustomerIds.length?inArray(auditLogs.actorId,matchedCustomerIds):undefined,
        matchedCustomerIds.length?inArray(auditLogs.resourceId,matchedCustomerIds):undefined,
      )
    : undefined;
  const filter = categoryFilter(category);
  const where = filter && searchFilter ? and(filter, searchFilter) : filter || searchFilter;
  const [items, totalRows, allRows, loginRows, emailRows, scheduledRows, customerRows, proxyRows] = await Promise.all([
    db.select({...getTableColumns(auditLogs)}).from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(size).offset((page - 1) * size),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(where),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(loginFilter),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(emailFilter),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(scheduledFilter),
    db.select({id:customers.id,name:customers.name,email:customers.email}).from(customers),
    db.select({id:proxyAllocations.id,host:proxyAllocations.host,port:proxyAllocations.port}).from(proxyAllocations),
  ]);

  const all = Number(allRows[0]?.value || 0);
  const login = Number(loginRows[0]?.value || 0);
  const email = Number(emailRows[0]?.value || 0);
  const scheduled = Number(scheduledRows[0]?.value || 0);
  const customerMap=new Map(customerRows.map(customer=>[customer.id,customer])),proxyMap=new Map(proxyRows.map(proxy=>[proxy.id,`${proxy.host}:${proxy.port}`]));
  const displayProxy=(id:unknown)=>proxyMap.get(String(id||""))||`资源 #${String(id||"").slice(0,8)}`;
  const enrichDetail=(raw:string|null)=>{if(!raw)return raw;try{const value=JSON.parse(raw);for(const key of ["allocationId","resourceId"]){if(value[key])value[key]=displayProxy(value[key])}if(Array.isArray(value.allocationIds))value.allocationIds=value.allocationIds.map(displayProxy);return JSON.stringify(value)}catch{return raw}};
  const namedItems=items.map(item=>({...item,logNo:item.id.slice(0,8).toUpperCase(),detail:enrichDetail(item.detail),resourceDisplay:item.resourceType==="proxy"&&item.resourceId?displayProxy(item.resourceId):null,actorName:customerMap.get(item.actorId)?.name||null,actorEmail:customerMap.get(item.actorId)?.email||null,resourceCustomerName:item.resourceType==="customer"&&item.resourceId?customerMap.get(item.resourceId)?.name||null:null}));
  return NextResponse.json({
    items:namedItems,
    page,
    size,
    total: Number(totalRows[0]?.value || 0),
    counts: { all, login, email, scheduled, system: Math.max(0, all - login - email - scheduled) },
  });
}
