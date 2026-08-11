import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemOptions } from "../db/schema";

export async function upsertRecord(
  table: any,
  keyColumn: any,
  keyValue: unknown,
  insertValues: Record<string, unknown>,
  updateValues: Record<string, unknown>,
) {
  const db = getDb();
  const [existing] = await db.select({ key: keyColumn }).from(table).where(eq(keyColumn, keyValue)).limit(1);
  if (existing) {
    await db.update(table).set(updateValues).where(eq(keyColumn, keyValue));
    return "updated" as const;
  }
  await db.insert(table).values(insertValues);
  return "inserted" as const;
}

export async function setSystemOption(key: string, value: string, updatedAt = new Date()) {
  return upsertRecord(systemOptions, systemOptions.key, key, { key, value, updatedAt }, { value, updatedAt });
}
