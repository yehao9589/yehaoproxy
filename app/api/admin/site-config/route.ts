import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/admin-auth";
import {
  defaultSiteConfig,
  getSiteConfig,
  saveSiteConfig,
  type SiteConfig,
} from "../../../../lib/site-config";
import { audit } from "../../../../lib/audit";

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET() {
  if (!(await requireAdminApi("settings"))) {
    return NextResponse.json({ error: "无站务管理权限" }, { status: 403 });
  }
  return NextResponse.json(await getSiteConfig());
}

export async function POST(request: Request) {
  const admin = await requireAdminApi("settings");
  if (!admin) return NextResponse.json({ error: "无站务管理权限" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "站务参数无效" }, { status: 400 });

  const value: SiteConfig = {
    siteName: text(body.siteName, 40) || defaultSiteConfig.siteName,
    logoText: text(body.logoText, 4) || "Y",
    logoUrl: text(body.logoUrl, 500),
    topAdEnabled: Boolean(body.topAdEnabled),
    topAdText: text(body.topAdText, 120),
    topAdLink: text(body.topAdLink, 500),
    footerDescription: text(body.footerDescription, 180),
    companyName: text(body.companyName, 80),
    supportEmail: text(body.supportEmail, 120),
    copyright: text(body.copyright, 160),
    icpNumber: text(body.icpNumber, 80),
  };

  for (const url of [value.logoUrl, value.topAdLink]) {
    const isPreviewLogo = url === value.logoUrl && /^data:image\/(?:png|jpeg|webp);base64,/i.test(url);
    if (url && !isPreviewLogo && !/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      return NextResponse.json(
        { error: "图片或广告链接必须是完整网址或站内路径" },
        { status: 400 },
      );
    }
  }
  await saveSiteConfig(value);
  await audit(
    admin,
    "site.config.update",
    "site_config",
    "site_config",
    { fields: Object.keys(value) },
    request,
  );
  return NextResponse.json({ ok: true, value });
}
