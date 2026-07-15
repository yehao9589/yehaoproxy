import type { Metadata } from "next";
import "./globals.css";
import "./portal.css";
import "./admin.css";
import "./auth.css";
import "./verify.css";
import "./sections.css";
import "./navlinks.css";
import "./auth-state.css";
import "./live.css";
import "./live-admin.css";
import "./standalone-admin.css";
import "./admin-extras.css";
import "./customer-pages.css";
import "./account-tables.css";
import "./admin-integrated.css";
import "./admin-footer-fix.css";
import "./inventory-import.css";
import "./customer-detail.css";
import "./business-modules.css";
import "./customer-record.css";
import "./customer-horizontal-nav.css";
import "./impersonation.css";
import "./impersonation-button.css";
import "./unified-dashboard.css";
import "./settings-center.css";
import "./payment-settings.css";
import "./credit.css";
import "./admin-button-system.css";
import CreditEnhancer from "./CreditEnhancer";
import AdjustmentEnhancer from "./AdjustmentEnhancer";
import CurrencyEnhancer from "./CurrencyEnhancer";

export const metadata: Metadata = {
  title: "YehaoProxy｜全球企业级代理 IP",
  description: "静态住宅 ISP、动态住宅与数据中心代理 IP，一站式采购。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<CreditEnhancer/><AdjustmentEnhancer/><CurrencyEnhancer/></body></html>;
}
