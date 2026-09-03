import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFile(resolve(root, path), "utf8");

async function filesUnder(path) {
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const item = `${path}/${entry.name}`;
    if (entry.isDirectory()) output.push(...await filesUnder(item));
    else output.push(item);
  }
  return output;
}

test("store cart creates authenticated, server-priced orders", async () => {
  const home = await read("app/page.tsx");
  const cart = await read("app/StoreCart.tsx");
  const orderApi = await read("app/api/orders/batch/route.ts");
  assert.match(home, /<StoreCart/);
  assert.match(cart, /\/api\/orders\/batch/);
  assert.match(cart, /\/login\?next=/);
  assert.match(orderApi, /getCurrentCustomer/);
  assert.match(orderApi, /productOffers/);
  assert.doesNotMatch(orderApi, /unitEstimate/);
});

test("customer APIs enforce ownership and active admin APIs require admin auth", async () => {
  for (const file of [
    "app/api/proxies/route.ts",
    "app/api/orders/route.ts",
    "app/api/wallet/route.ts",
    "app/api/tickets/route.ts",
    "app/api/whitelist/route.ts",
  ]) assert.match(await read(file), /getCurrentCustomer/);

  for (const file of [
    "app/api/admin/orders/route.ts",
    "app/api/admin/customers/route.ts",
    "app/api/admin/settings/route.ts",
    "app/api/admin/update-center/route.ts",
  ]) assert.match(await read(file), /requireAdminApi/);

  assert.match(await read("app/api/admin/inventory-bulk/route.ts"), /status:\s*410/);
  assert.match(await read("app/api/whitelist/route.ts"), /ipWhitelist\.customerId/);
  assert.match(await read("app/api/notifications/route.ts"), /notifications\.customerId/);

  const adminRoutes = (await filesUnder("app/api/admin")).filter(file => file.endsWith("route.ts"));
  for (const file of adminRoutes) assert.doesNotMatch(await read(file), /requireAdminApi\(\)/, `${file} must request a module permission`);
});

test("credentials, authentication, and installer use production-safe controls", async () => {
  const auth = await read("lib/auth.ts");
  const crypto = await read("lib/inventory-crypto.ts");
  const mail = await read("app/api/auth/email-code/route.ts");
  const installer = await read("app/api/install/route.ts");
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /210000/);
  assert.match(auth, /customer\.status!=="active"/);
  assert.match(auth, /expiresAt:new Date\(now\.getTime\(\)\+ttl\)/);
  assert.doesNotMatch(auth, /legacyDeadline|session\.createdAt\.getTime\(\)\+ttl/);
  assert.match(crypto, /AES-GCM/);
  assert.match(crypto, /INVENTORY_ENCRYPTION_KEY/);
  assert.doesNotMatch(mail, /previewDelivery|NextResponse\.json\(\{[^)]*\bcode\b/);
  assert.doesNotMatch(installer, /INSTALL_TOKEN|installToken|部署密钥/);
  assert.match(installer, /before\.installed/);
  assert.match(mail, /consumeRateLimit/);
  assert.match(await read("app/api/admin/site-logo/route.ts"), /matchesImageSignature/);
});

test("wallet payment and refunds are atomic and idempotent", async () => {
  const payment = await read("app/api/orders/[id]/pay-wallet/route.ts");
  const refund = await read("app/api/admin/orders/[id]/refund/route.ts");
  assert.match(payment, /db\.batch/);
  assert.match(payment, /nextBusinessId\("TX"/);
  assert.match(payment, /serviceRequests/);
  assert.match(refund, /db\.batch/);
  assert.match(refund, /nextBusinessId\("TX"/);
  assert.match(refund, /wallet:/);
  assert.match(refund, /amount:transaction\.amount/);
});

test("system currency defaults stay consistent across new orders and wallets", async () => {
  const [schema, installSchema, currenciesApi, orderApi, batchApi, rechargeApi, adjustApi, refundApi, enhancer] = await Promise.all([
    read("db/schema.ts"),
    read("lib/install-schema.ts"),
    read("app/api/admin/currencies/route.ts"),
    read("app/api/orders/route.ts"),
    read("app/api/orders/batch/route.ts"),
    read("app/api/wallet/recharge/route.ts"),
    read("app/api/admin/wallet-adjust/route.ts"),
    read("app/api/admin/orders/[id]/refund/route.ts"),
    read("app/CurrencyEnhancer.tsx"),
  ]);
  assert.doesNotMatch(schema, /default\("USD"\)/);
  assert.doesNotMatch(installSchema, /DEFAULT 'USD'/);
  assert.match(currenciesApi, /code:"CNY"[^\n]+enabled:true,isDefault:true/);
  assert.match(orderApi, /activeCurrency\?\.code \|\| "CNY"/);
  assert.match(batchApi, /activeCurrency\?\.code \|\| "CNY"/);
  assert.match(rechargeApi, /activeCurrency\?\.code\|\|"CNY"/);
  assert.match(adjustApi, /activeCurrency\?\.code \|\| "CNY"/);
  assert.match(refundApi, /activeCurrency\?\.code \|\| order\.currency \|\| "CNY"/);
  assert.match(enhancer, /symbol="¥",code="CNY"/);
  assert.match(enhancer, /select\[name="currency"\]/);
});

test("legacy preview routes redirect into authenticated real applications", async () => {
  assert.match(await read("app/admin-preview/page.tsx"), /redirect\("\/admin"\)/);
  assert.match(await read("app/dashboard-preview/page.tsx"), /redirect\("\/dashboard"\)/);
  assert.match(await read("app/dashboard-preview/[section]/page.tsx"), /\/dashboard\?tab=proxies/);
});

test("unfinished payment and notification adapters fail closed", async () => {
  const payments = await read("lib/payments.ts");
  const checkout = await read("app/api/checkout/[gateway]/route.ts");
  const settings = await read("app/api/admin/settings/route.ts");
  assert.match(payments, /gatewayRuntimeSupported/);
  assert.match(payments, /gateway==="alipay"/);
  assert.match(payments, /支付适配器尚未完成签名与回调验签/);
  assert.match(checkout, /getCurrentCustomer/);
  assert.match(checkout, /gatewayRuntimeSupported/);
  assert.match(settings, /该支付适配器和回调验签尚未完成/);
});

test("production deployment has health checks, backups, and rollback safety", async () => {
  const compose = await read("docker-compose.production.yml");
  const singleCompose = await read("docker-compose.single.yml");
  const singleController = await read("scripts/single-container.mjs");
  const sqliteCompose = await read("docker-compose.sqlite.yml");
  const dockerfile = await read("Dockerfile");
  const viteConfig = await read("vite.config.ts");
  const updater = await read("scripts/update-runner.mjs");
  const sqliteRunner = await read("scripts/sqlite-runner.mjs");
  const health = await read("app/api/health/route.ts");
  const runtimeMigrations = await read("scripts/mysql-runtime-migrations.mjs");
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /healthcheck:/);
  assert.doesNotMatch(compose, /INSTALL_TOKEN/);
  assert.doesNotMatch(singleCompose, /INSTALL_TOKEN|MYSQL_BRIDGE_SECRET|INVENTORY_ENCRYPTION_KEY|CRON_SECRET|XPANEL_BRIDGE_SECRET|UPDATE_WEBHOOK_TOKEN/);
  assert.match(singleController, /system-secrets\.json/);
  assert.match(singleController, /randomBytes\(32\)/);
  assert.match(singleController, /migrateRuntime/);
  assert.match(runtimeMigrations, /SHOW COLUMNS FROM/);
  assert.match(runtimeMigrations, /ALTER TABLE/);
  assert.match(sqliteCompose, /DATABASE_DRIVER:\s*sqlite/);
  assert.doesNotMatch(sqliteCompose, /mysql-bridge/);
  assert.match(sqliteCompose, /sqlite-runner\.mjs/);
  assert.match(sqliteCompose, /sqlite_data:\/workspace\/\.wrangler\/state/);
  assert.match(dockerfile, /cloudflare-node-loader\.mjs/);
  assert.equal((dockerfile.match(/COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.[/]/g) || []).length, 2);
  assert.equal((dockerfile.match(/pnpm rebuild --pending/g) || []).length, 2);
  assert.match(sqliteRunner, /\.dev\.vars/);
  assert.ok(viteConfig.indexOf("vinext(),") < viteConfig.indexOf("cloudflare({"), "vinext must register before the Cloudflare plugin");
  assert.match(updater, /validateArchive/);
  assert.match(updater, /rolling_back/);
  assert.doesNotMatch(updater, /\.env\.local.*tar/);
  assert.match(health, /encryptionConfigured/);
});

test("v1 release metadata and workflow are pinned behind a quality gate", async () => {
  const [pkg, compose, manifest, workflow, updateCenter] = await Promise.all([
    read("package.json"),
    read("docker-compose.single.yml"),
    read("public/releases.json"),
    read(".github/workflows/publish-images.yml"),
    read("lib/update-center.ts"),
  ]);
  assert.match(pkg, /"version": "1\.0\.0"/);
  assert.match(pkg, /"check": "pnpm run lint && pnpm run typecheck && pnpm run test"/);
  assert.match(compose, /yehaoproxy:v1\.0\.0/);
  assert.match(compose, /UPDATE_CHANNEL: stable/);
  assert.match(manifest, /"version": "v1\.0\.0"/);
  assert.match(workflow, /quality:/);
  assert.match(workflow, /needs: quality/);
  assert.match(updateCenter, /branch: "main"/);
  assert.doesNotMatch(updateCenter, /codex\/pre-release-hardening/);
});

test("MySQL bridge preserves duplicate columns for Drizzle row mapping", async () => {
  const database = await read("db/index.ts");
  const bridge = await read("scripts/mysql-bridge.mjs");
  assert.match(database, /execute\(true\)/);
  assert.match(database, /rawRows/);
  assert.match(bridge, /rowsAsArray:true/);
  assert.match(bridge, /normalizedRaw/);
});

test("proxy notes hide internal metadata while preserving it on customer edits", async () => {
  const helper = await read("lib/proxy-note.ts");
  const listRoute = await read("app/api/proxies/route.ts");
  const updateRoute = await read("app/api/proxies/[id]/route.ts");
  const exportRoute = await read("app/api/proxies/export/route.ts");
  assert.match(helper, /CITY\|ACTIVATED_AT/);
  assert.match(helper, /visibleProxyNote/);
  assert.match(listRoute, /visibleProxyNote/);
  assert.match(updateRoute, /composeProxyNote/);
  assert.match(exportRoute, /visibleProxyNote/);
  assert.match(exportRoute, /国家\/地区,城市/);
  assert.match(exportRoute, /Asia\/Shanghai/);
});

test("customer order totals separate effective revenue from refunds", async () => {
  const customerApi = await read("app/api/admin/customers/[id]/route.ts");
  const customerUi = await read("app/admin/customers/CustomersClient.tsx");
  assert.match(customerApi, /refundedAmount/);
  assert.match(customerApi, /paidOrderCount/);
  assert.match(customerUi, /有效收款/);
  assert.match(customerUi, /已退款/);
});

test("proxy batch renewal uses the direct renewal wording and order flow", async () => {
  const proxyUi = await read("app/dashboard/proxies/ProxiesClient.tsx");
  const bulkApi = await read("app/api/proxies/bulk/route.ts");
  const walletPayment = await read("app/api/orders/[id]/pay-wallet/route.ts");
  const onlinePayment = await read("lib/online-payment.ts");
  assert.doesNotMatch(proxyUi, /批量申请续费/);
  assert.match(proxyUi, />批量续费</);
  assert.match(bulkApi, /proxy\.renewal_orders\.create/);
  assert.match(bulkApi, /db\.insert\(orders\)/);
  assert.match(bulkApi, /BUNDLE_RENEWAL/);
  assert.match(walletPayment, /childSourceId/);
  assert.match(onlinePayment, /RENEW_APPLIED_AT/);
});

test("Alipay checkout applies coupons server-side and opens externally", async () => {
  const checkoutApi = await read("app/api/checkout/[gateway]/route.ts");
  const orderUi = await read("app/dashboard/orders/OrderClient.tsx");
  const adminOrders = await read("app/api/admin/orders/route.ts");
  const insights = await read("app/api/admin/insights/route.ts");
  assert.match(checkoutApi, /couponRedemptions/);
  assert.match(checkoutApi, /couponCode/);
  assert.match(checkoutApi, /convertCurrency\(payable/);
  assert.match(checkoutApi, /withRequestLock\(requestedCouponCode/);
  assert.match(orderUi, /window\.open\("about:blank","_blank"\)/);
  assert.match(orderUi, /couponCode:couponCode\.trim\(\)/);
  assert.match(orderUi, /externalPaymentOrderId/);
  assert.match(orderUi, /已完成支付/);
  assert.match(orderUi, /location\.reload\(\)/);
  assert.match(adminOrders, /couponCode:\s*coupon\?\.code/);
  assert.match(adminOrders, /originalAmount/);
  assert.match(insights, /redemptionsByOrder/);
  assert.match(insights, /discountAmount/);
  assert.match(await read("app/api/orders/[id]/pay-wallet/route.ts"), /withRequestLock\(couponCode/);
});

test("renewals complete for customers while remaining pending verification for admins", async () => {
  const [ordersApi, orderUi, walletPayment, onlinePayment, renewalAdmin, verifyApi] = await Promise.all([
    read("app/api/orders/route.ts"),
    read("app/dashboard/orders/OrderClient.tsx"),
    read("app/api/orders/[id]/pay-wallet/route.ts"),
    read("lib/online-payment.ts"),
    read("app/admin/RenewalOrders.tsx"),
    read("app/api/admin/orders/[id]/complete-renewal/route.ts"),
  ]);
  assert.match(ordersApi, /bundleRenewal/);
  assert.match(ordersApi, /bundleRenewalApplied/);
  assert.match(ordersApi, /renewalApplied\|\|bundleRenewalApplied \? "active"/);
  assert.match(orderUi, /order\.renewalOf\|\|order\.bundleRenewal/);
  assert.match(orderUi, /续费完成/);
  assert.match(walletPayment, /bundleRenewal \? "active" : "provisioning"/);
  assert.match(onlinePayment, /directRenewalSourceId/);
  assert.match(renewalAdmin, /RENEWAL_VERIFIED_AT/);
  assert.match(renewalAdmin, /待核验/);
  assert.match(renewalAdmin, /busy\?\.startsWith\(`\$\{row\.id\}:`\)/);
  assert.doesNotMatch(renewalAdmin, /disabled=\{busy !== null\}/);
  assert.match(verifyApi, /RENEWAL_VERIFIED_AT/);
});

test("bundle renewal verification completes the parent bill after every child is verified", async () => {
  const route = await read("app/api/admin/orders/[id]/complete-renewal/route.ts");
  const listRoute = await read("app/api/admin/orders/route.ts");
  assert.match(route, /noteValue\(renewal\.adminNote, "BUNDLE_PARENT"\)/);
  assert.match(route, /siblings\.every\(\(item\) => item\.id === id \|\| noteValue\(item\.adminNote, "RENEWAL_VERIFIED_AT"\)\)/);
  assert.match(route, /where\(eq\(orders\.id, parentId\)\)/);
  assert.match(listRoute, /allRenewalsVerified/);
  assert.match(listRoute, /\[RENEWAL_VERIFIED_AT\]\$\{now\.toISOString\(\)\}/);
});

test("billing separates payment, delivery, renewal verification, and after-sales workflows", async () => {
  const [manager, detail, detailApi, enhancer, workflow] = await Promise.all([
    read("app/admin/OrderManager.tsx"),
    read("app/admin/OrderDetailWorkspace.tsx"),
    read("app/api/admin/orders/[id]/route.ts"),
    read("app/ManualAllocationEnhancer.tsx"),
    read("lib/bill-workflow.ts"),
  ]);
  assert.match(manager, /收款状态/);
  assert.match(manager, /业务进度/);
  assert.match(manager, /续费待核验/);
  assert.match(manager, /账单只负责收款与查看进度/);
  assert.doesNotMatch(manager, /const orderActionName/);
  assert.match(detailApi, /billType:billKind/);
  assert.match(detail, /data-workspace-context=\{billOnly\?"bill":"delivery"\}/);
  assert.match(detail, /不执行产品交付/);
  assert.match(detail, /不会创建新 IP、不会产生新的资源交付任务/);
  assert.match(enhancer, /workspace\.dataset\.workspaceContext==="bill"/);
  assert.match(workflow, /续费已生效 · 待核验/);
  assert.match(workflow, /等待产品交付/);
});

test("audit logs use one Chinese display layer for admin and customer records", async () => {
  const display = await read("lib/audit-display.ts");
  const auditClient = await read("app/admin/audit/AuditClient.tsx");
  const customerApi = await read("app/api/admin/customers/[id]/route.ts");
  const customerClient = await read("app/admin/customers/CustomersClient.tsx");
  assert.match(display, /percent:"按百分比折扣"/);
  assert.match(display, /"pre-release":"预发布通道"/);
  assert.match(display, /"node\.renewal\.create":"创建节点续费订单"/);
  assert.match(display, /"proxy\.renewal_orders\.create":"创建代理续费订单"/);
  assert.match(display, /ACTIVATED_AT/);
  assert.match(display, /历史记录内容无法识别/);
  assert.match(display, /hiddenKeys/);
  assert.doesNotMatch(auditClient, /相关信息/);
  assert.match(auditClient, /item\.actionLabel/);
  assert.match(customerApi, /actionLabel:auditActionName/);
  assert.match(customerApi, /detailLabel:auditDetailText/);
  assert.match(customerClient, /row\.actionLabel\s*\|\|\s*"系统操作"/);
  assert.match(customerClient, /className="customer-log-list"/);
  assert.match(customerClient, /row\.detailLabel\s*\|\|\s*"操作已记录"/);
});

test("required commercial pages and deployment configuration exist", async () => {
  for (const file of [
    "app/login/page.tsx",
    "app/register/page.tsx",
    "app/forgot-password/page.tsx",
    "app/dashboard/proxies/page.tsx",
    "app/dashboard/orders/page.tsx",
    "app/dashboard/wallet/page.tsx",
    "app/dashboard/support/page.tsx",
    "app/dashboard/whitelist/page.tsx",
    "app/admin/customers/page.tsx",
    "app/admin/service-requests/page.tsx",
    "app/admin/settings/page.tsx",
    "DEPLOYMENT.md",
    ".env.example",
    ".openai/hosting.json",
  ]) assert.ok((await read(file)).length > 20, file);
});
