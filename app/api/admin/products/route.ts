import {NextResponse} from "next/server";
import {asc} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {productOffers} from "../../../../db/schema";

const PRODUCTS = new Set(["static-isp", "residential", "datacenter", "soft-router", "computer-node"]);
const NODE_PRODUCTS = new Set(["soft-router", "computer-node"]);

export async function GET() {
  if (!await requireAdminApi()) return NextResponse.json({error: "无管理员权限"}, {status: 403});
  return NextResponse.json({items: await getDb().select().from(productOffers).orderBy(asc(productOffers.sortOrder))});
}

export async function POST(req: Request) {
  if (!await requireAdminApi()) return NextResponse.json({error: "无管理员权限"}, {status: 403});
  const body = await req.json().catch(() => null);
  const product = String(body?.product || "");
  const isNode = NODE_PRODUCTS.has(product);
  const region = isNode ? "GLOBAL" : String(body?.region || "").trim().toUpperCase();
  const regionName = isNode ? "全局节点" : String(body?.regionName || region).trim();
  const price7 = Number(body?.price7);
  const price30 = Number(body?.price30);
  const price90 = Number(body?.price90);
  const saleStock = Number(body?.saleStock);

  if (!PRODUCTS.has(product) || (!isNode && !/^[A-Z]{2}$/.test(region)) || !regionName ||
      ![price7, price30, price90].every(value => Number.isFinite(value) && value > 0) ||
      !Number.isInteger(saleStock) || saleStock < 0) {
    return NextResponse.json({error: "商品参数无效"}, {status: 400});
  }

  const now = new Date();
  const id = `offer-${crypto.randomUUID()}`;
  await getDb().insert(productOffers).values({
    id, product, region, regionName, price7, price30, price90, saleStock,
    sold: 0,
    enabled: body?.enabled !== false,
    sortOrder: Number(body?.sortOrder) || 100,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ok: true, id}, {status: 201});
}
