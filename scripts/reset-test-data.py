import hashlib
import json
import secrets
import sqlite3
import sys
import time
from pathlib import Path

db_path = Path(sys.argv[1]).resolve()
if not db_path.is_file() or db_path.suffix != ".sqlite":
    raise SystemExit(f"数据库文件无效: {db_path}")

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
now = int(time.time())
day = 86_400

def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210000, 32).hex()
    return f"pbkdf2$210000${salt}${digest}"

def columns(table: str) -> set[str]:
    return {row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')}

tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]

def add(table: str, **values):
    if table not in tables:
        return
    allowed = columns(table)
    data = {key: value for key, value in values.items() if key in allowed}
    keys = list(data)
    marks = ",".join("?" for _ in keys)
    conn.execute(f'INSERT INTO "{table}" ({",".join(keys)}) VALUES ({marks})', [data[key] for key in keys])

conn.execute("PRAGMA foreign_keys=OFF")
conn.execute("BEGIN IMMEDIATE")
for table in tables:
    if not table.startswith("_cf_"):
        conn.execute(f'DELETE FROM "{table}"')

# 管理员与客户：数据库真实主键从源头统一为 user-N。
add("customers", id="admin", email="admin", name="超级管理员", password_hash=password_hash("admin"), email_verified=1, role="admin", status="active", created_at=now-120*day)
users = [
    ("user-1", "lin.chen@example.com", "林晨", 1280.50, 300.00),
    ("user-2", "mika.wu@example.com", "吴米卡", 860.00, 0.00),
    ("user-3", "kevin.zhao@example.com", "赵凯文", 420.25, 500.00),
]
for index, (uid, email, name, balance, credit) in enumerate(users):
    add("customers", id=uid, email=email, name=name, password_hash=password_hash("test123456"), email_verified=1, role="customer", status="active", created_at=now-(90-index*17)*day)
    add("wallets", customer_id=uid, balance=balance, frozen=0, credit_limit=credit, currency="CNY", updated_at=now-index*3600)

permissions = ["overview","orders","products","inventory","customers","finance","sales","tickets","coupons","requests","automation","settings","audit","admins"]
add("admin_roles", id="role-super-admin", name="超级管理员", permissions=json.dumps(permissions, ensure_ascii=False), created_at=now-120*day, updated_at=now)
add("admin_memberships", customer_id="admin", role_id="role-super-admin", enabled=1, created_at=now-120*day)

# 商品与币种配置。
offers = [
    ("offer-us", "static-isp", "US", "美国", 12, 30, 78, 0),
    ("offer-jp", "static-isp", "JP", "日本", 15, 36, 92, 1),
    ("offer-de", "static-isp", "DE", "德国", 14, 34, 86, 2),
    ("offer-node", "computer-node", "GLOBAL", "电脑节点", 0, 99, 260, 3),
    ("offer-router", "soft-router", "GLOBAL", "软路由中转", 0, 129, 340, 4),
]
for oid, product, region, name, p7, p30, p90, sort in offers:
    add("product_offers", id=oid, product=product, region=region, region_name=name, price_7=p7, price_30=p30, price_90=p90, sale_stock=0, sold=0, enabled=1, sort_order=sort, created_at=now-100*day, updated_at=now)
for code, name, symbol, rate, enabled, default, sort in [("CNY","人民币","¥",7.2,1,1,1),("USD","美元","$",1,0,0,2),("EUR","欧元","€",0.92,0,0,3)]:
    add("currencies", code=code, name=name, symbol=symbol, rate=rate, enabled=enabled, is_default=default, decimal_places=2, sort_order=sort, updated_at=now)

options = {
    "customer_ip_self_extraction":"true",
    "node_credentials_edit_enabled":"true",
    "ip_replace_free_days":"3",
    "ip_replace_free_count":"1",
    "ip_replace_price":"5",
    "node_traffic_reset_price":"10",
}
for key, value in options.items():
    add("system_options", key=key, value=value, updated_at=now)

# 产品订单与账单。父单表示一次合并结算，子单保持“一条 IP 一个订单”。
order_rows = [
    ("YH-T10001", "lin.chen@example.com", "cart-bundle", "US + JP", 2, 30, 66.00, "active", "PAY-T10001", "balance", now-18*day, now-18*day, None, "[BUNDLE_PARENT]\n测试合并结算"),
    ("YH-T10001-01", "lin.chen@example.com", "static-isp", "US/Virginia", 1, 30, 30.00, "active", "PAY-T10001", "balance", now-18*day, now-18*day, now+12*day, "[BUNDLE_CHILD]YH-T10001"),
    ("YH-T10001-02", "lin.chen@example.com", "static-isp", "JP/Tokyo", 1, 30, 36.00, "active", "PAY-T10001", "balance", now-18*day, now-18*day, now+12*day, "[BUNDLE_CHILD]YH-T10001"),
    ("YH-T10002", "mika.wu@example.com", "computer-node", "GLOBAL", 1, 30, 99.00, "active", "PAY-T10002", "balance", now-9*day, now-8*day, now+22*day, "电脑节点测试服务"),
    ("YH-T10003", "kevin.zhao@example.com", "static-isp", "DE/Frankfurt", 1, 30, 34.00, "provisioning", "PAY-T10003", "balance", now-2*day, now-2*day, None, "等待人工开通"),
    ("YH-T10004", "lin.chen@example.com", "static-isp", "US/Virginia", 1, 30, 30.00, "pending", None, "balance", now-1*day, now-1*day, None, None),
    ("YH-T10005", "mika.wu@example.com", "ip-replacement", "static-isp / JP/Tokyo", 1, 0, 5.00, "refunded", "PAY-T10005", "balance", now-6*day, now-4*day, None, "[BILLING_MODE]one-time"),
    ("YH-T10006", "kevin.zhao@example.com", "soft-router", "GLOBAL", 1, 30, 129.00, "failed", None, "manual", now-12*day, now-11*day, None, "测试取消订单"),
]
for row in order_rows:
    oid,email,product,region,qty,duration,amount,status,reference,method,created,updated,expires,note=row
    add("orders", id=oid, customer_email=email, product=product, region=region, quantity=qty, duration_days=duration, amount=amount, currency="CNY", status=status, payment_reference=reference, payment_method=method, expires_at=expires, renewal_amount=amount if duration else None, auto_renew=1 if oid in ("YH-T10001-01","YH-T10002") else 0, admin_note=note, created_at=created, updated_at=updated)

# 库存与已分配代理。
inventory_rows = [
    ("INV-001","US","Virginia","66.17.66.101",443,"user_us01","pass_us01","SOCKS5","allocated","YH-T10001-01"),
    ("INV-002","JP","Tokyo","103.75.118.21",8443,"user_jp01","pass_jp01","HTTPS","allocated","YH-T10001-02"),
    ("INV-003","DE","Frankfurt","45.91.82.33",443,"user_de01","pass_de01","SOCKS5","reserved","YH-T10003"),
    ("INV-004","US","Virginia","66.17.66.111",443,"stock01","stockpass01","SOCKS5","available",None),
    ("INV-005","US","Virginia","66.17.66.112",443,"stock02","stockpass02","HTTPS","available",None),
    ("INV-006","JP","Tokyo","103.75.118.31",8443,"stock03","stockpass03","SOCKS5","available",None),
    ("INV-007","DE","Frankfurt","45.91.82.43",443,"stock04","stockpass04","HTTPS","available",None),
    ("INV-008","GB","London","86.53.47.80",443,"stock05","stockpass05","SOCKS5","available",None),
]
for iid,country,city,host,port,user,password,protocol,status,reserved in inventory_rows:
    add("inventory", id=iid, source="manual", supplier_id=None, product="static-isp", country=country, city=city, host=host, port=port, username=user, encrypted_password=password, fingerprint=f"{host}:{port}", protocol=protocol, cost=8, sale_price=30, status=status, reserved_by_order_id=reserved, external_id=None, expires_at=now+90*day, created_at=now-30*day, updated_at=now)
for aid, order_id, host, port, user, password, protocol, expires in [
    ("PA-001","YH-T10001-01","66.17.66.101",443,"user_us01","pass_us01","SOCKS5",now+12*day),
    ("PA-002","YH-T10001-02","103.75.118.21",8443,"user_jp01","pass_jp01","HTTPS",now+12*day),
]:
    add("proxy_allocations", id=aid, order_id=order_id, host=host, port=port, username=user, encrypted_password=password, protocol=protocol, note="重建测试数据", auto_renew=1, expires_at=expires, status="active")

# 钱包流水真实引用 user-N，不再出现 local-user-N。
transactions = [
    ("WT-10001","user-1","deposit",1500,1500,"recharge","RC-10001","测试充值",now-30*day),
    ("WT-10002","user-1","purchase",-66,1434,"order","YH-T10001","合并订单余额支付",now-18*day),
    ("WT-10003","user-1","adjustment",-153.5,1280.5,"admin","admin","测试余额校准",now-3*day),
    ("WT-20001","user-2","deposit",1000,1000,"recharge","RC-20001","测试充值",now-20*day),
    ("WT-20002","user-2","purchase",-99,901,"order","YH-T10002","电脑节点订单支付",now-9*day),
    ("WT-20003","user-2","refund",5,906,"order","YH-T10005","更换 IP 服务退款",now-4*day),
    ("WT-20004","user-2","adjustment",-46,860,"admin","admin","测试余额校准",now-2*day),
    ("WT-30001","user-3","deposit",500,500,"recharge","RC-30001","测试充值",now-10*day),
    ("WT-30002","user-3","purchase",-34,466,"order","YH-T10003","代理订单支付",now-2*day),
    ("WT-30003","user-3","adjustment",-45.75,420.25,"admin","admin","测试余额校准",now-1*day),
]
for tid,uid,kind,amount,balance,ref_type,ref_id,note,created in transactions:
    add("wallet_transactions", id=tid, customer_id=uid, type=kind, amount=amount, balance_after=balance, reference_type=ref_type, reference_id=ref_id, note=note, operator_id="admin" if kind=="adjustment" else None, created_at=created)

# 工单、售后、通知、审计和优惠券。
add("tickets", id="TK-10001", customer_id="user-1", subject="美国代理连接速度不稳定", category="connection", priority="high", status="waiting_staff", assigned_admin_id=None, created_at=now-day, updated_at=now-day)
add("ticket_messages", id="TM-10001", ticket_id="TK-10001", author_id="user-1", author_role="customer", body="测试工单：晚高峰连接延迟较高。", internal=0, created_at=now-day)
add("service_requests", id="SR-10001", customer_id="user-1", allocation_id="PA-001", type="replace", duration_days=None, reason="连接质量异常（免费更换测试）", amount=0, status="pending", admin_note=None, created_at=now-12*3600, updated_at=now-12*3600)
add("notifications", id="NT-10001", customer_id="user-1", type="order_active", title="代理服务已开通", body="订单 YH-T10001-01 已完成开通。", link="/dashboard?tab=proxies", read=0, created_at=now-18*day)
add("coupons", id="CP-TEST10", code="TEST10", type="percent", value=10, min_amount=20, max_discount=20, total_limit=100, used_count=0, enabled=1, starts_at=now-day, expires_at=now+60*day, created_at=now)
add("audit_logs", id="LOG-10001", actor_id="admin", actor_role="admin", action="database.test_data.reset", resource_type="system", resource_id=None, detail=json.dumps({"customers":["user-1","user-2","user-3"]}, ensure_ascii=False), ip_address="127.0.0.1", created_at=now)

conn.commit()
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

counts = {table: conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in tables if not table.startswith("_cf_")}
invalid = []
for table in ("customers","wallets","wallet_transactions","tickets","service_requests","notifications"):
    if table in tables and "customer_id" in columns(table):
        invalid.extend((table, row[0]) for row in conn.execute(f'SELECT DISTINCT customer_id FROM "{table}" WHERE customer_id LIKE "local-%"'))
invalid.extend(("customers", row[0]) for row in conn.execute('SELECT id FROM customers WHERE id LIKE "local-%"'))
print(json.dumps({"database":str(db_path),"counts":counts,"legacy_customer_ids":invalid}, ensure_ascii=False, indent=2))
conn.close()
