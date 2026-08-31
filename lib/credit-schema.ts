import {databaseDriver,getRawDatabase} from "../db";

let migration:Promise<void>|null=null;

export function ensureCreditSchema(){
  if(migration)return migration;
  migration=(async()=>{
    const raw=getRawDatabase();
    if(databaseDriver()==="mysql"){
      await raw.exec("CREATE TABLE IF NOT EXISTS credit_accounts (customer_id VARCHAR(191) PRIMARY KEY,terms_days BIGINT NOT NULL DEFAULT 7,bill_day BIGINT NOT NULL DEFAULT 1,repayment_day BIGINT NOT NULL DEFAULT 10,grace_days BIGINT NOT NULL DEFAULT 2,status VARCHAR(191) NOT NULL DEFAULT 'active',updated_at BIGINT NOT NULL)");
      await raw.exec("CREATE TABLE IF NOT EXISTS credit_bills (id VARCHAR(191) PRIMARY KEY,customer_id VARCHAR(191) NOT NULL,order_id VARCHAR(191) NOT NULL UNIQUE,amount DOUBLE NOT NULL,repaid_amount DOUBLE NOT NULL DEFAULT 0,currency VARCHAR(191) NOT NULL,status VARCHAR(191) NOT NULL DEFAULT 'unpaid',statement_at BIGINT NULL,due_at BIGINT NOT NULL,grace_ends_at BIGINT NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL)");
      await raw.exec("ALTER TABLE credit_accounts ADD COLUMN bill_day BIGINT NOT NULL DEFAULT 1").catch(()=>{});
      await raw.exec("ALTER TABLE credit_accounts ADD COLUMN repayment_day BIGINT NOT NULL DEFAULT 10").catch(()=>{});
      await raw.exec("ALTER TABLE credit_bills ADD COLUMN statement_at BIGINT NULL").catch(()=>{});
      return;
    }
    await raw.exec("CREATE TABLE IF NOT EXISTS credit_accounts (customer_id TEXT PRIMARY KEY,terms_days INTEGER NOT NULL DEFAULT 7,bill_day INTEGER NOT NULL DEFAULT 1,repayment_day INTEGER NOT NULL DEFAULT 10,grace_days INTEGER NOT NULL DEFAULT 2,status TEXT NOT NULL DEFAULT 'active',updated_at INTEGER NOT NULL)");
    await raw.exec("CREATE TABLE IF NOT EXISTS credit_bills (id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,order_id TEXT NOT NULL UNIQUE,amount REAL NOT NULL,repaid_amount REAL NOT NULL DEFAULT 0,currency TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'unpaid',statement_at INTEGER,due_at INTEGER NOT NULL,grace_ends_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)");
    await raw.exec("ALTER TABLE credit_accounts ADD COLUMN bill_day INTEGER NOT NULL DEFAULT 1").catch(()=>{});
    await raw.exec("ALTER TABLE credit_accounts ADD COLUMN repayment_day INTEGER NOT NULL DEFAULT 10").catch(()=>{});
    await raw.exec("ALTER TABLE credit_bills ADD COLUMN statement_at INTEGER").catch(()=>{});
  })().catch(error=>{migration=null;throw error});
  return migration;
}
