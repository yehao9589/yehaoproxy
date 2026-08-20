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
  assert.match(crypto, /AES-GCM/);
  assert.match(crypto, /INVENTORY_ENCRYPTION_KEY/);
  assert.doesNotMatch(mail, /previewDelivery|NextResponse\.json\(\{[^)]*\bcode\b/);
  assert.match(installer, /INSTALL_TOKEN/);
  assert.match(installer, /before\.installed/);
  assert.match(mail, /consumeRateLimit/);
});

test("wallet payment and refunds are atomic and idempotent", async () => {
  const payment = await read("app/api/orders/[id]/pay-wallet/route.ts");
  const refund = await read("app/api/admin/orders/[id]/refund/route.ts");
  assert.match(payment, /db\.batch/);
  assert.match(payment, /WT-PAY-/);
  assert.match(payment, /serviceRequests/);
  assert.match(refund, /db\.batch/);
  assert.match(refund, /WT-REFUND-/);
  assert.match(refund, /wallet:/);
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
  const sqliteCompose = await read("docker-compose.sqlite.yml");
  const dockerfile = await read("Dockerfile");
  const viteConfig = await read("vite.config.ts");
  const updater = await read("scripts/update-runner.mjs");
  const sqliteRunner = await read("scripts/sqlite-runner.mjs");
  const health = await read("app/api/health/route.ts");
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /INSTALL_TOKEN/);
  assert.match(sqliteCompose, /DATABASE_DRIVER:\s*sqlite/);
  assert.doesNotMatch(sqliteCompose, /mysql-bridge/);
  assert.match(sqliteCompose, /sqlite-runner\.mjs/);
  assert.match(sqliteCompose, /sqlite_data:\/workspace\/\.wrangler\/state/);
  assert.match(dockerfile, /cloudflare-node-loader\.mjs/);
  assert.match(sqliteRunner, /\.dev\.vars/);
  assert.ok(viteConfig.indexOf("vinext(),") < viteConfig.indexOf("cloudflare({"), "vinext must register before the Cloudflare plugin");
  assert.match(updater, /validateArchive/);
  assert.match(updater, /rolling_back/);
  assert.doesNotMatch(updater, /\.env\.local.*tar/);
  assert.match(health, /encryptionConfigured/);
});

test("MySQL bridge preserves duplicate columns for Drizzle row mapping", async () => {
  const database = await read("db/index.ts");
  const bridge = await read("scripts/mysql-bridge.mjs");
  assert.match(database, /execute\(true\)/);
  assert.match(database, /rawRows/);
  assert.match(bridge, /rowsAsArray:true/);
  assert.match(bridge, /normalizedRaw/);
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
