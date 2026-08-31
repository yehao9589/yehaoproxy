import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../../db";
import { creditAccounts, creditBills, currencies, customers, wallets } from "../../../../../../db/schema";
import { requireAdminApi } from "../../../../../../lib/admin-auth";
import { audit } from "../../../../../../lib/audit";
import { withRequestLock } from "../../../../../../lib/request-lock";
import {creditCycleForDate,ensureCreditAccount,getCreditSummary} from "../../../../../../lib/credit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi("customers");
  if (!admin) return NextResponse.json({ error: "无客户管理权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const creditLimit = Number(body?.creditLimit);
  const billDay=Number(body?.billDay??1),repaymentDay=Number(body?.repaymentDay??10),graceDays=Number(body?.graceDays??2);
  const status=body?.status==="frozen"?"frozen":"active";
  if (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > 1000000) return NextResponse.json({ error: "信用额度应在 0–1,000,000 之间" }, { status: 400 });
  if(!Number.isInteger(billDay)||billDay<1||billDay>28)return NextResponse.json({error:"账单日应在每月 1–28 日之间"},{status:400});
  if(!Number.isInteger(repaymentDay)||repaymentDay<1||repaymentDay>28)return NextResponse.json({error:"还款日应在每月 1–28 日之间"},{status:400});
  if(!Number.isInteger(graceDays)||graceDays<0||graceDays>30)return NextResponse.json({error:"宽限期应在 0–30 天之间"},{status:400});
  return withRequestLock(`wallet:${id}`, async () => {
    const db = getDb();
    const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer || customer.role !== "customer") return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    await ensureCreditAccount(id,billDay,repaymentDay,graceDays);
    const [wallet] = await db.select().from(wallets).where(eq(wallets.customerId, id)).limit(1);
    const summary=await getCreditSummary(id),used=summary.creditUsed;
    const[activeCurrency]=await db.select().from(currencies).where(eq(currencies.isDefault,true)).limit(1);
    if (!wallet) await db.insert(wallets).values({ customerId: id, balance: 0, frozen: 0, creditLimit, currency: activeCurrency?.code||"CNY", updatedAt: new Date() });
    else {
      if (creditLimit < used) return NextResponse.json({ error: `当前已使用信用 ${(activeCurrency?.symbol||"¥")}${used.toFixed(2)}，新额度不能低于已使用金额` }, { status: 409 });
      await db.update(wallets).set({ creditLimit, updatedAt: new Date() }).where(eq(wallets.customerId, id));
    }
    const now=new Date();await db.update(creditAccounts).set({billDay,repaymentDay,graceDays,status,updatedAt:now}).where(eq(creditAccounts.customerId,id));
    for(const bill of summary.openBills){const cycle=creditCycleForDate(bill.createdAt,billDay,repaymentDay,graceDays);await db.update(creditBills).set({...cycle,updatedAt:now}).where(eq(creditBills.id,bill.id))}
    await audit({ id: admin.id, role: admin.role }, "customer.credit.update", "wallet", id, { creditLimit,billDay,repaymentDay,graceDays,status }, req);
    return NextResponse.json({ ok: true, creditLimit,billDay,repaymentDay,graceDays,status });
  });
}
