import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {systemOptions} from "../db/schema";
import {normalizeUnpaidOrderPolicy} from "./unpaid-order-policy";
export async function getUnpaidOrderPolicy(){const [row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,"unpaid_order_policy")).limit(1);let input={};try{input=JSON.parse(row?.value||"{}")}catch{}return normalizeUnpaidOrderPolicy(input)}
