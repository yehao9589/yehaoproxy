import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemOptions } from "../db/schema";

let queue: Promise<void> = Promise.resolve();

function shanghaiDate(value: Date, period: "day" | "month") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "00";
  return period === "month"
    ? `${part("year")}${part("month")}`
    : `${part("year")}${part("month")}${part("day")}`;
}

/** Generates stable, readable public business numbers such as YH-20260827-0001. */
export async function nextBusinessId(prefix: string, createdAt = new Date(), period: "day" | "month" = "day") {
  const normalized = prefix.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (!normalized) throw new Error("业务编号前缀无效");
  const date = shanghaiDate(createdAt, period);
  const key = `business_id_counter:${normalized}:${date}`;
  let result = "";
  const task = queue.then(async () => {
    const db = getDb();
    const [current] = await db.select().from(systemOptions).where(eq(systemOptions.key, key)).limit(1);
    const sequence = Math.max(1, Number.parseInt(current?.value || "0", 10) + 1);
    if (current) await db.update(systemOptions).set({ value: String(sequence), updatedAt: createdAt }).where(eq(systemOptions.key, key));
    else await db.insert(systemOptions).values({ key, value: String(sequence), updatedAt: createdAt });
    result = `${normalized}-${date}-${String(sequence).padStart(4, "0")}`;
  });
  queue = task.catch(() => {});
  await task;
  return result;
}
