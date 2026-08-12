import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../../db";
import { notifications, ticketMessages, tickets } from "../../../../../../db/schema";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi("tickets");
  if (!admin) return NextResponse.json({ error: "无工单管理权限" }, { status: 403 });
  const { id } = await params;
  const input = await req.json().catch(() => null);
  const body = String(input?.body || "").trim().slice(0, 5000);
  const internal = Boolean(input?.internal);
  const db = getDb();
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket || ticket.status === "closed") return NextResponse.json({ error: "工单不可回复" }, { status: 409 });
  if (body.length < 2) return NextResponse.json({ error: "回复内容为空" }, { status: 400 });
  const now = new Date();
  await db.batch([
    db.insert(ticketMessages).values({ id: crypto.randomUUID(), ticketId: id, authorId: admin.id, authorRole: "admin", body, internal, createdAt: now }),
    db.update(tickets).set({ status: internal ? ticket.status : "waiting_customer", assignedAdminId: admin.id, updatedAt: now }).where(eq(tickets.id, id)),
    ...(internal ? [] : [db.insert(notifications).values({ id: crypto.randomUUID(), customerId: ticket.customerId, type: "ticket_reply", title: "工单有新回复", body: ticket.subject, link: "/dashboard?tab=support", read: false, createdAt: now })]),
  ]);
  await audit({ id: admin.id, role: admin.role }, "ticket.reply", "ticket", id, { internal }, req);
  return NextResponse.json({ ok: true, status: internal ? ticket.status : "waiting_customer" });
}
