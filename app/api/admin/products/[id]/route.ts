import {NextResponse} from "next/server";
import {eq} from "drizzle-orm";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {getDb} from "../../../../../db";
import {productOffers} from "../../../../../db/schema";

const PRODUCTS = new Set(["static-isp", "residential", "datacenter", "mobile", "computer-node"]);

export async function PATCH(req: Request, {params}: {params: Promise<{id: string}>}) {
  if (!await requireAdminApi()) {
    return NextResponse.json({error: "无管理员权限"}, {status: 403});
  }

  const {id} = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({error: "商品参数无效"}, {status: 400});

  const patch: Record<string, unknown> = {updatedAt: new Date()};

  if (body.product !== undefined) {
    const product = String(body.product);
    if (!PRODUCTS.has(product)) return NextResponse.json({error: "商品类型无效"}, {status: 400});
    patch.product = product;
  }
  if (body.region !== undefined) {
    const region = String(body.region).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) return NextResponse.json({error: "地区代码必须是两位英文字母"}, {status: 400});
    patch.region = region;
  }
  if (body.regionName !== undefined) {
    const regionName = String(body.regionName).trim();
    if (!regionName) return NextResponse.json({error: "地区名称不能为空"}, {status: 400});
    patch.regionName = regionName;
  }

  for (const key of ["price7", "price30", "price90"] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({error: "周期价格必须大于 0"}, {status: 400});
    }
    patch[key] = value;
  }

  if (body.saleStock !== undefined) {
    const value = Number(body.saleStock);
    if (!Number.isInteger(value) || value < 0) {
      return NextResponse.json({error: "销售额度必须是非负整数"}, {status: 400});
    }
    patch.saleStock = value;
  }
  if (body.sortOrder !== undefined) {
    const value = Number(body.sortOrder);
    if (!Number.isInteger(value)) return NextResponse.json({error: "排序值必须是整数"}, {status: 400});
    patch.sortOrder = value;
  }
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);

  await getDb().update(productOffers).set(patch).where(eq(productOffers.id, id));
  return NextResponse.json({ok: true});
}
