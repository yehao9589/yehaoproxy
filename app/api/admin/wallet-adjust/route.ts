import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { currencies, customers, wallets, walletTransactions } from "../../../../db/schema";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { audit } from "../../../../lib/audit";
import { withRequestLock } from "../../../../lib/request-lock";
import {nextBusinessId} from "../../../../lib/business-id";

export async function POST(req: Request) {
  const admin = await requireAdminApi("finance");
  if (!admin) return NextResponse.json({ error: "无财务管理权限" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const customerId = String(body?.customerId || "");
  const amount = Number(body?.amount);
  const note = String(body?.note || "").trim();
  if (!customerId || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000 || note.length < 3) {
    return NextResponse.json({ error: "调整参数无效" }, { status: 400 });
  }

  return withRequestLock(`wallet:${customerId}`, async () => {
    const db = getDb();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    let [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, customerId)).limit(1);
    if (!wallet) {
      const [activeCurrency] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.isDefault, true)).limit(1);
      await db.insert(wallets).values({ customerId, balance: 0, frozen: 0, creditLimit: 0, currency: activeCurrency?.code || "CNY", updatedAt: new Date() });
      [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, customerId)).limit(1);
    }
    const nextBalance = Number((wallet.balance + amount).toFixed(2));
    if (nextBalance < 0) return NextResponse.json({ error: "调整后余额不能为负数" }, { status: 409 });
    const now = new Date();
    const transactionId = await nextBusinessId("TX", now);
    await db.batch([
      db.update(wallets).set({ balance: nextBalance, updatedAt: now }).where(eq(wallets.customerId, customerId)),
      db.insert(walletTransactions).values({ id: transactionId, customerId, type: "adjustment", amount, balanceAfter: nextBalance, referenceType: "admin", referenceId: admin.id, note, operatorId: admin.id, createdAt: now }),
    ]);
    await audit({ id: admin.id, role: admin.role }, "wallet.adjust", "wallet", customerId, { amount, balanceAfter: nextBalance, note }, req);
    return NextResponse.json({ ok: true, transactionId, balance: nextBalance });
  });
}
