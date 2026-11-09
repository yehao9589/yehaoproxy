import {NextResponse} from "next/server";
import {and, eq, inArray, ne, notInArray, sql} from "drizzle-orm";
import {getDb} from "../../../../db";
import {orders, proxyAllocations, tickets} from "../../../../db/schema";
import {getAdminAccess} from "../../../../lib/admin-auth";
import {isAttentionExpiry, summarizeAttentionOrders, type AttentionCounts} from "../../../../lib/admin-attention";
import {databaseText} from "../../../../lib/database-text";
import {AFTER_SALES_TICKET_CATEGORIES} from "../../../../lib/ticket-categories";

/** A read-only, permission-scoped summary. Never return customer or VPS details. */
export async function GET() {
  const access = await getAdminAccess();
  if (!access) return NextResponse.json({error:"无后台访问权限"}, {status:403});
  const canOrders = access.permissions.includes("orders");
  const canTickets = access.permissions.includes("tickets");
  if (!canOrders && !canTickets) return NextResponse.json({error:"无待办查看权限"}, {status:403});
  const db = getDb(), now = Date.now();
  const counts: AttentionCounts = {};
  const jobs: Promise<void>[] = [];
  if (canOrders) {
    counts.provision = counts.review = counts.expiring = null;
    jobs.push((async () => {
      // No recent-page limit: old paid orders must not disappear from the count.
      const [orderRows, proxyRows] = await Promise.all([
        db.select({product:orders.product, status:orders.status, durationDays:orders.durationDays,
          adminNote:orders.adminNote, expiresAt:orders.expiresAt}).from(orders)
          .where(inArray(orders.status, ["paid", "provisioning", "active"])),
        db.select({expiresAt:proxyAllocations.expiresAt}).from(proxyAllocations)
          .innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
          .where(and(eq(proxyAllocations.status,"active"), ne(orders.status,"refunded"))),
      ]);
      const summary = summarizeAttentionOrders(orderRows.map(row => ({...row, adminNote:databaseText(row.adminNote)})), now);
      counts.provision = summary.provision;
      counts.review = summary.review;
      counts.expiring = summary.expiringNodes + proxyRows.filter(row => isAttentionExpiry(row.expiresAt, now)).length;
    })().catch(() => { /* Keep unavailable counts null, never invent zero. */ }));
  }
  if (canTickets) {
    counts.tickets = null;
    jobs.push((async () => {
      const [row] = await db.select({value:sql<number>`count(*)`}).from(tickets).where(and(
        inArray(tickets.status,["open","waiting_staff"]),
        notInArray(tickets.category,[...AFTER_SALES_TICKET_CATEGORIES]),
      ));
      counts.tickets = Number(row?.value || 0);
    })().catch(() => { /* Other permitted categories can still be shown. */ }));
  }
  await Promise.all(jobs);
  return NextResponse.json({counts, checkedAt:new Date(now).toISOString()}, {headers:{"Cache-Control":"no-store"}});
}
