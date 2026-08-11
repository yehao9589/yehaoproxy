import json
import sqlite3
import sys
from pathlib import Path

db_path=Path(sys.argv[1]).resolve()
if not db_path.is_file() or db_path.suffix!=".sqlite":
    raise SystemExit(f"数据库文件无效: {db_path}")

conn=sqlite3.connect(db_path)
tables={row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}

def clear(table):
    if table in tables:
        conn.execute(f'DELETE FROM "{table}"')

conn.execute("PRAGMA foreign_keys=OFF")
conn.execute("BEGIN IMMEDIATE")

# 清除下单、付款、发放和售后链路，但保留账户、钱包余额、商品、配置和库存。
for table in [
    "coupon_redemptions",
    "payment_transactions",
    "provider_events",
    "service_requests",
    "proxy_allocations",
    "wallet_transactions",
    "orders",
]:
    clear(table)

# 清理测试订单产生的消息与审计痕迹，避免新测试时混淆。
if "notifications" in tables:
    conn.execute("DELETE FROM notifications WHERE link LIKE '%orders%' OR link LIKE '%proxies%' OR type LIKE 'order_%'")
if "audit_logs" in tables:
    conn.execute("DELETE FROM audit_logs WHERE resource_type IN ('order','proxy','service_request','wallet')")

# 原来已分配、预留的库存全部恢复可售。
if "inventory" in tables:
    cols={row[1] for row in conn.execute("PRAGMA table_info(inventory)")}
    sets=["status='available'"]
    if "reserved_by_order_id" in cols:
        sets.append("reserved_by_order_id=NULL")
    conn.execute(f"UPDATE inventory SET {','.join(sets)} WHERE status IN ('reserved','allocated') OR reserved_by_order_id IS NOT NULL")

conn.commit()
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

def count(table):
    return conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] if table in tables else None

result={
    "customers":count("customers"),
    "wallets":count("wallets"),
    "orders":count("orders"),
    "wallet_transactions":count("wallet_transactions"),
    "payment_transactions":count("payment_transactions"),
    "proxy_allocations":count("proxy_allocations"),
    "service_requests":count("service_requests"),
    "available_inventory":conn.execute("SELECT COUNT(*) FROM inventory WHERE status='available'").fetchone()[0] if "inventory" in tables else None,
}
print(json.dumps(result,ensure_ascii=False,indent=2))
conn.close()
