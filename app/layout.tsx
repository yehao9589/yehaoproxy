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
import "./order-resource.css";
import "./proxy-qr.css";
import "./customer-orders.css";
import "./order-coupon.css";
import "./coupon-editor.css";
import "./manual-allocation.css";
import "./proxy-batch.css";
import "./proxy-copy.css";
import "./auto-renew-switch.css";
import "./proxy-table-layout.css";
import "./proxy-usage.css";
import "./proxy-usage-detail.css";
import "./dashboard-compact.css";
import "./service-policy-settings.css";
import "./node-subscription.css";
import CreditEnhancer from "./CreditEnhancer";
import AdjustmentEnhancer from "./AdjustmentEnhancer";
import CurrencyEnhancer from "./CurrencyEnhancer";
import OrderResourceEnhancer from "./OrderResourceEnhancer";
import CustomerRecordEnhancer from "./CustomerRecordEnhancer";
import DashboardExpiryEnhancer from "./DashboardExpiryEnhancer";
import ProxyQrEnhancer from "./ProxyQrEnhancer";
import ManualAllocationEnhancer from "./ManualAllocationEnhancer";
import ProxyOverviewCopyEnhancer from "./ProxyOverviewCopyEnhancer";
import AutoRenewSwitchEnhancer from "./AutoRenewSwitchEnhancer";
import ResourceExpiryEnhancer from "./ResourceExpiryEnhancer";
import OverviewLinkEnhancer from "./OverviewLinkEnhancer";
import CustomerLogChineseEnhancer from "./CustomerLogChineseEnhancer";
import ProxyBatchExportEnhancer from "./ProxyBatchExportEnhancer";
import OverviewStatusEnhancer from "./OverviewStatusEnhancer";
import OrderCenterLinkEnhancer from "./OrderCenterLinkEnhancer";
import ProxyReplaceEnhancer from "./ProxyReplaceEnhancer";
import DashboardRecentOrdersEnhancer from "./DashboardRecentOrdersEnhancer";
import NodeSubscriptionEnhancer from "./NodeSubscriptionEnhancer";
import PaymentReturnEnhancer from "./PaymentReturnEnhancer";
import RenewalVerificationEnhancer from "./RenewalVerificationEnhancer";

export const metadata: Metadata = {
  title: "YehaoProxy｜全球企业级代理 IP",
  description: "静态住宅 ISP、动态住宅与数据中心代理 IP，一站式采购。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<CreditEnhancer/><AdjustmentEnhancer/><CurrencyEnhancer/><OrderResourceEnhancer/><CustomerRecordEnhancer/><DashboardExpiryEnhancer/><ProxyQrEnhancer/><ManualAllocationEnhancer/><ProxyOverviewCopyEnhancer/><AutoRenewSwitchEnhancer/><ResourceExpiryEnhancer/><OverviewLinkEnhancer/><CustomerLogChineseEnhancer/><ProxyBatchExportEnhancer/><OverviewStatusEnhancer/><OrderCenterLinkEnhancer/><ProxyReplaceEnhancer/><DashboardRecentOrdersEnhancer/><NodeSubscriptionEnhancer/><PaymentReturnEnhancer/><RenewalVerificationEnhancer/></body></html>;
}
