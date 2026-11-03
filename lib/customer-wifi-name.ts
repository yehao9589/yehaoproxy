import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { orders, proxyAllocations } from "../db/schema.ts";
import { duplicateWifiNames, suggestWifiName } from "./wifi-name.ts";

export async function customerWifiNameSuggestion(
  db: ReturnType<typeof getDb>, customerEmail: string, product: string, region: string,
) {
  const history = await db.select({
    id: proxyAllocations.id,
    wifiName: proxyAllocations.wifiName,
    note: proxyAllocations.note,
    createdAt: orders.createdAt,
  }).from(proxyAllocations).innerJoin(orders, eq(proxyAllocations.orderId, orders.id)).where(and(
    eq(orders.customerEmail, customerEmail),
    eq(orders.product, product),
    eq(orders.region, region),
  ));
  // Expired services are deliberately included so old numbers are not reused.
  return suggestWifiName(history);
}

export async function customerWifiNameDuplicates(
  db: ReturnType<typeof getDb>, customerEmail: string, name: string | null, excludeAllocationId?: string,
) {
  if (!name?.trim()) return [];
  const rows = await db.select({
    id: proxyAllocations.id, orderId: proxyAllocations.orderId,
    wifiName: proxyAllocations.wifiName, host: proxyAllocations.host,
    port: proxyAllocations.port, status: proxyAllocations.status,
  }).from(proxyAllocations).innerJoin(orders, eq(proxyAllocations.orderId, orders.id))
    .where(eq(orders.customerEmail, customerEmail));
  // Deliberately cross-product/country, including expired services, but never other customers.
  return duplicateWifiNames(rows, name, excludeAllocationId).map(row => ({
    id: row.id, orderId: row.orderId, wifiName: row.wifiName,
    address: `${row.host}:${row.port}`, status: row.status,
  }));
}
