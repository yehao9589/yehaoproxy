import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemOptions } from "../db/schema";

export type SiteConfig = {
  siteName: string;
  logoText: string;
  logoUrl: string;
  topAdEnabled: boolean;
  topAdText: string;
  topAdLink: string;
  footerDescription: string;
  companyName: string;
  supportEmail: string;
  copyright: string;
  icpNumber: string;
};

export const defaultSiteConfig: SiteConfig = {
  siteName: "YehaoProxy",
  logoText: "Y",
  logoUrl: "",
  topAdEnabled: true,
  topAdText: "新用户专享优惠 · 企业客户可申请专属线路与批量价格",
  topAdLink: "",
  footerDescription: "可靠的全球代理与节点服务，让每一次连接都更简单。",
  companyName: "YehaoProxy",
  supportEmail: "support@yehaoproxy.com",
  copyright: "© 2026 YehaoProxy. All rights reserved.",
  icpNumber: "",
};

const KEY = "site_config";

export async function getSiteConfig(): Promise<SiteConfig> {
  const [row] = await getDb()
    .select()
    .from(systemOptions)
    .where(eq(systemOptions.key, KEY))
    .limit(1);
  if (!row) return defaultSiteConfig;
  try {
    return { ...defaultSiteConfig, ...JSON.parse(row.value) };
  } catch {
    return defaultSiteConfig;
  }
}

export async function saveSiteConfig(value: SiteConfig) {
  const db = getDb();
  const now = new Date();
  const json = JSON.stringify(value);
  await db
    .insert(systemOptions)
    .values({ key: KEY, value: json, updatedAt: now })
    .onConflictDoUpdate({
      target: systemOptions.key,
      set: { value: json, updatedAt: now },
    });
}
