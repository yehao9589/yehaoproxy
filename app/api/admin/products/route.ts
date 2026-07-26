import {NextResponse} from "next/server";
import {asc} from "drizzle-orm";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getDb} from "../../../../db";
import {productOffers} from "../../../../db/schema";
import {getProductTypes} from "../../../../lib/product-types";

export async function GET() {
  if (!await requireAdminApi()) return NextResponse.json({error: "无管理员权限"}, {status: 403});
  return NextResponse.json({items: await getDb().select().from(productOffers).orderBy(asc(productOffers.sortOrder)),productTypes:await getProductTypes()});
}

export async function POST(req: Request) {
  if (!await requireAdminApi()) return NextResponse.json({error: "无管理员权限"}, {status: 403});
  const body = await req.json().catch(() => null);
  const product = String(body?.product || "");
  const types=await getProductTypes(),type=types.find(x=>x.id===product&&x.enabled),isNode=type?.category==="node";
  const region = isNode ? "GLOBAL" : String(body?.region || "").trim().toUpperCase();
  const regionName = isNode ? "全局节点" : String(body?.regionName || region).trim();
  const parsePrice = (value: unknown) => value === undefined || value === null || String(value).trim() === "" ? -1 : Number(value);
  const price7 = parsePrice(body?.price7);
  const price30 = parsePrice(body?.price30);
  const price90 = parsePrice(body?.price90);
  const rawSaleStock = body?.saleStock;
  const saleStock = rawSaleStock === undefined || rawSaleStock === null || String(rawSaleStock).trim() === ""
    ? -1
    : Number(rawSaleStock);

  if (!type || (!isNode && !/^[A-Z]{2}$/.test(region)) || !regionName ||
      ![price7, price30, price90].every(value => Number.isFinite(value) && (value === -1 || value > 0)) ||
      [price7, price30, price90].every(value => value < 0) ||
      !Number.isInteger(saleStock) || saleStock < -1) {
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
