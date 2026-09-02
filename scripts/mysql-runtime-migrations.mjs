import mysql from "mysql2/promise";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) process.exit(0);

// Columns introduced after the first public deployments. Every operation is
// idempotent: current databases are left untouched, while older Baota MySQL
// databases receive only the fields they are missing.
const requiredColumns = {
  customers: {
    password_hash: "LONGTEXT NULL",
    email_verified: "BIGINT NOT NULL DEFAULT 0",
    status: "VARCHAR(191) NOT NULL DEFAULT 'active'",
  },
  orders: {
    payment_reference: "LONGTEXT NULL",
    payment_method: "VARCHAR(191) NOT NULL DEFAULT 'balance'",
    expires_at: "BIGINT NULL",
    renewal_amount: "DOUBLE NULL",
    auto_renew: "BIGINT NOT NULL DEFAULT 0",
    admin_note: "LONGTEXT NULL",
    updated_at: "BIGINT NOT NULL DEFAULT 0",
  },
  proxy_allocations: {
    username: "LONGTEXT NULL",
    encrypted_password: "LONGTEXT NULL",
    wifi_name: "LONGTEXT NULL",
    note: "LONGTEXT NULL",
    auto_renew: "BIGINT NOT NULL DEFAULT 0",
    expires_at: "BIGINT NULL",
    status: "VARCHAR(191) NOT NULL DEFAULT 'active'",
  },
  inventory: {
    supplier_id: "LONGTEXT NULL",
    city: "LONGTEXT NULL",
    username: "LONGTEXT NULL",
    encrypted_password: "LONGTEXT NULL",
    wifi_name: "LONGTEXT NULL",
    cost: "DOUBLE NULL",
    reserved_by_order_id: "LONGTEXT NULL",
    external_id: "LONGTEXT NULL",
    expires_at: "BIGINT NULL",
  },
  payment_gateways: {
    secret_ref: "LONGTEXT NULL",
    webhook_secret_ref: "LONGTEXT NULL",
    configuration: "LONGTEXT NULL",
  },
  email_verifications: {
    purpose: "VARCHAR(191) NOT NULL DEFAULT 'register'",
    attempts: "BIGINT NOT NULL DEFAULT 0",
    verified: "BIGINT NOT NULL DEFAULT 0",
  },
  auth_sessions: {
    user_agent: "LONGTEXT NULL",
    ip_address: "LONGTEXT NULL",
  },
  audit_logs: {
    detail: "LONGTEXT NULL",
    ip_address: "LONGTEXT NULL",
  },
  service_requests: {
    duration_days: "BIGINT NULL",
    reason: "LONGTEXT NULL",
    amount: "DOUBLE NULL",
    admin_note: "LONGTEXT NULL",
    updated_at: "BIGINT NOT NULL DEFAULT 0",
  },
  wallets: {
    frozen: "DOUBLE NOT NULL DEFAULT 0",
    credit_limit: "DOUBLE NOT NULL DEFAULT 0",
    currency: "VARCHAR(191) NOT NULL DEFAULT 'CNY'",
  },
  wallet_transactions: {
    reference_type: "LONGTEXT NULL",
    reference_id: "LONGTEXT NULL",
    note: "LONGTEXT NULL",
    operator_id: "LONGTEXT NULL",
  },
  product_offers: {
    billing_cycle: "VARCHAR(191) NOT NULL DEFAULT 'fixed-days'",
    price_180: "DOUBLE NOT NULL DEFAULT -1",
  },
};

let connection;
let lastError;
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    connection = await mysql.createConnection({ uri: databaseUrl, connectTimeout: 5000 });
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 20) await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
if (!connection) throw lastError || new Error("MySQL 迁移连接失败");

try {
  let added = 0;
  for (const [table, definitions] of Object.entries(requiredColumns)) {
    const [tableRows] = await connection.query("SHOW TABLES LIKE ?", [table]);
    if (!Array.isArray(tableRows) || tableRows.length === 0) continue;
    const [columnRows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    const existing = new Set(columnRows.map(row => String(row.Field)));
    for (const [column, definition] of Object.entries(definitions)) {
      if (existing.has(column)) continue;
      await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      added++;
      console.log(`[schema] added ${table}.${column}`);
    }
  }
  console.log(`[schema] runtime compatibility check complete (${added} columns added)`);
} finally {
  await connection.end();
}
