import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../../db";
import { customers, wallets } from "../../../../../../db/schema";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";
import { withRequestLock } from "../../../../../../lib/request-lock";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi("customers");
  if (!admin) return NextResponse.json({ error: "无客户管理权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const creditLimit = Number(body?.creditLimit);
  if (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > 1000000) return NextResponse.json({ error: "信用额度应在 0–1,000,000 之间" }, { status: 400 });
  return withRequestLock(`wallet:${id}`, async () => {
    const db = getDb();
    const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer || customer.role !== "customer") return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, id)).limit(1);
    if (!wallet) await db.insert(wallets).values({ customerId: id, balance: 0, frozen: 0, creditLimit, currency: "USD", updatedAt: new Date() });
    else {
      const used = Math.max(0, -wallet.balance);
      if (creditLimit < used) return NextResponse.json({ error: `当前已使用信用 $${used.toFixed(2)}，新额度不能低于已使用金额` }, { status: 409 });
      await db.update(wallets).set({ creditLimit, updatedAt: new Date() }).where(eq(wallets.customerId, id));
    }
    await audit({ id: admin.id, role: admin.role }, "customer.credit.update", "wallet", id, { creditLimit }, req);
    return NextResponse.json({ ok: true, creditLimit });
  });
}
