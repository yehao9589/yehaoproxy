import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

const source = resolve(argument("--source"));
const databaseUrl = argument("--database-url", process.env.DATABASE_URL || "");
const apply = process.argv.includes("--apply");
const replace = process.argv.includes("--replace");
const backupPath = resolve(argument("--backup", `${source}.backup`));

if (!argument("--source")) throw new Error("缺少 --source SQLite 数据库路径");
if (!databaseUrl) throw new Error("缺少 --database-url 或 DATABASE_URL");

function quote(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
}

function normalize(value) {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  if (typeof value === "bigint") return value.toString();
  return value;
}

const sqlite = new DatabaseSync(source, { readOnly: true });
const connection = await mysql.createConnection(databaseUrl);

try {
  const integrity = sqlite.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") throw new Error(`SQLite 完整性检查失败：${integrity?.integrity_check || "unknown"}`);

  const sourceTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map((row) => String(row.name));
  const [targetTableRows] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");
  const targetTables = new Set(targetTableRows.map((row) => String(row.name)));
  const tables = sourceTables.filter((table) => targetTables.has(table));
  const missing = sourceTables.filter((table) => !targetTables.has(table));
  if (missing.length) throw new Error(`MySQL 缺少数据表：${missing.join("、")}`);

  const plan = [];
  for (const table of tables) {
    const sourceColumns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => String(row.name));
    const [targetColumnRows] = await connection.query("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", [table]);
    const targetColumns = new Set(targetColumnRows.map((row) => String(row.name)));
    const missingColumns = sourceColumns.filter((column) => !targetColumns.has(column));
    if (missingColumns.length) throw new Error(`MySQL 表 ${table} 缺少字段：${missingColumns.join("、")}`);
    const sourceCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}`).get().count);
    const [[targetCountRow]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(table)}`);
    plan.push({ table, columns: sourceColumns, sourceCount, targetCount: Number(targetCountRow.count) });
  }

  console.table(plan.map(({ table, sourceCount, targetCount }) => ({ table, SQLite: sourceCount, MySQL: targetCount })));
  if (!apply) {
    console.log("只读检查完成；添加 --apply 才会执行备份与迁移。");
    process.exitCode = 0;
  } else {
    const populated = plan.filter((item) => item.targetCount > 0);
    if (populated.length && !replace) throw new Error(`为避免覆盖数据，目标 MySQL 必须为空；当前非空表：${populated.map((item) => `${item.table}(${item.targetCount})`).join("、")}。确认已备份后可添加 --replace。`);

    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(source, backupPath);
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    const backupIntegrity = backup.prepare("PRAGMA integrity_check").get();
    backup.close();
    if (backupIntegrity?.integrity_check !== "ok") throw new Error("SQLite 备份完整性检查失败，迁移已中止");

    const [textColumns] = await connection.query("SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND DATA_TYPE='text'");
    for (const column of textColumns) {
      await connection.query(`ALTER TABLE ${quote(column.tableName)} MODIFY ${quote(column.columnName)} LONGTEXT ${column.nullable === "YES" ? "NULL" : "NOT NULL"}`);
    }

    await connection.beginTransaction();
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS=0");
      if (replace) {
        for (const item of [...plan].reverse()) await connection.query(`DELETE FROM ${quote(item.table)}`);
      }
      for (const item of plan) {
        if (!item.sourceCount) continue;
        const rows = sqlite.prepare(`SELECT ${item.columns.map(quote).join(",")} FROM ${quote(item.table)}`).all();
        const sql = `INSERT INTO ${quote(item.table)} (${item.columns.map(quote).join(",")}) VALUES (${item.columns.map(() => "?").join(",")})`;
        for (const row of rows) await connection.execute(sql, item.columns.map((column) => normalize(row[column])));
      }
      await connection.query("SET FOREIGN_KEY_CHECKS=1");
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    for (const item of plan) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(item.table)}`);
      const targetCount = Number(row.count);
      if (targetCount !== item.sourceCount) throw new Error(`迁移校验失败：${item.table} SQLite=${item.sourceCount} MySQL=${targetCount}`);
    }
    console.log(`迁移成功，SQLite 备份：${backupPath}`);
  }
} finally {
  sqlite.close();
  await connection.end();
}
