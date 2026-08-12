import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

const port = Number(process.env.PORT || 8788);
const workspace = process.env.UPDATE_PROJECT_DIR || "/workspace";
const backupRoot = process.env.UPDATE_BACKUP_DIR || "/backups";
const token = process.env.UPDATE_WEBHOOK_TOKEN || "";
const historyFile = join(backupRoot, "history.json");
const services = (process.env.UPDATE_SERVICES || "yehaoproxy scheduler xpanel-bridge mysql-bridge").split(/\s+/).filter(Boolean);
const maxUpload = 2 * 1024 * 1024 * 1024;
const composeFile = process.env.UPDATE_COMPOSE_FILE || "docker-compose.yml";
let running = false;

if (!token) {
  console.error("未配置 UPDATE_WEBHOOK_TOKEN，更新执行器拒绝启动");
  process.exit(1);
}

const compose = (...args) => ["compose", "-f", composeFile, ...args];
const command = (bin, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { cwd: workspace, ...options });
  const chunks = [];
  child.stdout?.on("data", (chunk) => chunks.push(chunk));
  child.stderr?.on("data", (chunk) => chunks.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => code === 0
    ? resolve(Buffer.concat(chunks).toString())
    : reject(new Error(Buffer.concat(chunks).toString() || `${bin} 退出码 ${code}`)));
});

async function history() {
  try { return JSON.parse(await readFile(historyFile, "utf8")); } catch { return []; }
}

async function saveHistory(rows) {
  await mkdir(backupRoot, { recursive: true });
  const temporary = `${historyFile}.tmp`;
  await writeFile(temporary, JSON.stringify(rows.slice(0, 50), null, 2));
  await rename(temporary, historyFile);
}

async function patchRecord(id, patchValue) {
  const rows = await history();
  const index = rows.findIndex((item) => item.id === id);
  if (index >= 0) rows[index] = { ...rows[index], ...patchValue };
  await saveHistory(rows);
  return rows[index];
}

async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function allowedEntry(value) {
  const name = String(value).replace(/^\.\//, "");
  return name === "mysql.sql"
    || name === ".wrangler/state"
    || name.startsWith(".wrangler/state/")
    || name === "public/uploads"
    || name.startsWith("public/uploads/");
}

async function validateArchive(file) {
  const entries = String(await command("tar", ["-tzf", file])).split(/\r?\n/).filter(Boolean);
  const verbose = String(await command("tar", ["-tvzf", file])).split(/\r?\n/).filter(Boolean);
  const unsafe = !entries.length
    || entries.some((item) => item.startsWith("/") || item.split("/").includes("..") || !allowedEntry(item))
    || verbose.some((line) => !/^[d-]/.test(line));
  if (unsafe) throw new Error("备份文件包含不安全或不受支持的目录");
  return entries;
}

async function readEnvironmentValue(key) {
  for (const name of [".env", ".env.local"]) {
    try {
      const content = await readFile(join(workspace, name), "utf8");
      const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (match?.[1]) return match[1].trim();
    } catch { /* 配置文件可不存在 */ }
  }
  return "";
}

async function activeDatabaseDriver() {
  return String(process.env.DATABASE_DRIVER || await readEnvironmentValue("DATABASE_DRIVER") || "sqlite").trim().toLowerCase();
}

async function databaseConnectionUrl() {
  try {
    const content = await readFile(join(workspace, ".backup.env"), "utf8");
    const match = content.match(/^DATABASE_URL=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch { /* 允许首次部署 */ }
  return process.env.DATABASE_URL || await readEnvironmentValue("DATABASE_URL");
}

async function mysqlArgs() {
  const raw = await databaseConnectionUrl();
  if (!raw || !/^mysql:/i.test(raw)) return null;
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

async function dumpMysql(file) {
  const config = await mysqlArgs();
  if (!config) return false;
  await command("mariadb-dump", ["--single-transaction", "--quick", "--skip-lock-tables", "-h", config.host, "-P", config.port, "-u", config.user, config.database, "--result-file", file], { env: { ...process.env, MYSQL_PWD: config.password } });
  return true;
}

async function restoreMysql(file) {
  const config = await mysqlArgs();
  if (!config || !existsSync(file)) return false;
  await new Promise((resolve, reject) => {
    const child = spawn("mariadb", ["-h", config.host, "-P", config.port, "-u", config.user, config.database], { cwd: workspace, env: { ...process.env, MYSQL_PWD: config.password } });
    const input = createReadStream(file);
    const chunks = [];
    input.pipe(child.stdin);
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(Buffer.concat(chunks).toString() || `数据库恢复退出码 ${code}`)));
  });
  return true;
}

async function backup(image = "", kind = "manual") {
  const prefix = kind === "update" ? "UP" : "BK";
  const id = `${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17)}-${randomUUID().slice(0, 6)}`;
  const archive = join(backupRoot, `${id}.tar.gz`);
  const stage = join("/tmp", id);
  await mkdir(backupRoot, { recursive: true });
  await mkdir(stage, { recursive: true });
  try {
    const paths = [".wrangler/state", "public/uploads"].filter((item) => existsSync(join(workspace, item)));
    const mysqlDump = join(stage, "mysql.sql");
    const hasMysql = await activeDatabaseDriver() === "mysql" ? await dumpMysql(mysqlDump) : false;
    if (!paths.length && !hasMysql) throw new Error("没有找到可备份的数据");
    const args = ["-czf", archive, ...paths];
    if (hasMysql) args.push("-C", stage, "mysql.sql");
    await command("tar", args);
    const containers = {};
    for (const service of services) {
      try { containers[service] = JSON.parse(await command("docker", compose("ps", "--format", "json", service))); }
      catch { containers[service] = null; }
    }
    const rows = await history();
    const createdAt = new Date().toISOString();
    const record = {
      id, kind, status: "backed_up", createdAt, updatedAt: createdAt, image, archive,
      fileName: basename(archive), checksum: await checksum(archive), database: hasMysql ? "mysql" : "sqlite",
      containsSecrets: false, containers,
      message: kind === "update" ? "更新前数据备份已完成" : "手动系统数据备份已完成",
    };
    rows.unshift(record);
    await saveHistory(rows);
    return record;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function healthy() {
  const url = process.env.UPDATE_HEALTH_URL || "http://yehaoproxy:3000/api/health";
  const attempts = Number(process.env.UPDATE_HEALTH_RETRIES || 18);
  for (let index = 0; index < attempts; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) return true;
    } catch { /* 继续重试 */ }
  }
  return false;
}

async function restore(record, reason = "手动恢复") {
  await patchRecord(record.id, { status: "rolling_back", updatedAt: new Date().toISOString(), message: reason });
  if (!record.archive || !existsSync(record.archive)) throw new Error("备份文件不存在");
  await validateArchive(record.archive);
  await backup(process.env.YEHAOPROXY_IMAGE || "", "safety");
  await command("tar", ["-xzf", record.archive, "-C", workspace]);
  const sql = join(workspace, "mysql.sql");
  if (existsSync(sql)) {
    await restoreMysql(sql);
    await unlink(sql).catch(() => {});
  }
  const restoreEnvironment = { ...process.env, ...(record.image ? { YEHAOPROXY_IMAGE: String(record.image) } : {}) };
  await command("docker", compose("up", "-d", ...services), { env: restoreEnvironment });
  const ok = await healthy();
  return patchRecord(record.id, {
    status: ok ? "restored" : "restore_failed",
    updatedAt: new Date().toISOString(),
    message: ok ? "系统数据恢复完成" : `恢复后健康检查失败：${reason}`,
  });
}

async function update(body) {
  if (running) throw new Error("已有任务正在执行");
  running = true;
  try {
    const targetImage = String(body.image || "").trim();
    if (!targetImage || !targetImage.includes(":")) throw new Error("更新镜像必须包含明确版本标签");
    const record = await backup(process.env.YEHAOPROXY_IMAGE || "", "update");
    await patchRecord(record.id, { status: "updating", targetImage, updatedAt: new Date().toISOString(), message: "正在拉取并替换容器" });
    const environment = { ...process.env, YEHAOPROXY_IMAGE: targetImage };
    await command("docker", compose("pull", ...services), { env: environment });
    await command("docker", compose("up", "-d", "--remove-orphans", ...services), { env: environment });
    if (!await healthy()) {
      await restore(record, "新版本健康检查失败，已触发自动回滚");
      throw new Error("新版本健康检查失败，系统已自动回滚");
    }
    process.env.YEHAOPROXY_IMAGE = targetImage;
    return patchRecord(record.id, { status: "completed", deployedImage: targetImage, updatedAt: new Date().toISOString(), message: "更新完成，健康检查正常" });
  } finally {
    running = false;
  }
}

async function rollback(id) {
  if (running) throw new Error("已有任务正在执行");
  const record = (await history()).find((item) => item.id === id);
  if (!record) throw new Error("备份记录不存在");
  running = true;
  try { return await restore(record); } finally { running = false; }
}

async function importBackup(req, fileName) {
  const safe = basename(fileName || "system-backup.tar.gz");
  if (!/\.tar\.gz$/i.test(safe)) throw new Error("只支持 .tar.gz 备份文件");
  const length = Number(req.headers["content-length"] || 0);
  if (length > maxUpload) throw new Error("备份文件不能超过 2GB");
  await mkdir(backupRoot, { recursive: true });
  const id = `IM-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17)}-${randomUUID().slice(0, 6)}`;
  const archive = join(backupRoot, `${id}.tar.gz`);
  await pipeline(req, createWriteStream(archive, { flags: "wx" }));
  let entries;
  try { entries = await validateArchive(archive); }
  catch (error) { await unlink(archive).catch(() => {}); throw error; }
  const now = new Date().toISOString();
  const record = {
    id, kind: "imported", status: "backed_up", createdAt: now, updatedAt: now, image: "", archive,
    fileName: safe, checksum: await checksum(archive), database: entries.includes("mysql.sql") ? "mysql" : "sqlite",
    containsSecrets: false, containers: {}, message: "外部数据备份已导入，等待确认恢复",
  };
  const rows = await history();
  rows.unshift(record);
  await saveHistory(rows);
  return record;
}

async function configureDatabase(input, { restart = true } = {}) {
  const driver = String(input.driver);
  if (!["mysql", "sqlite"].includes(driver)) throw new Error("数据库驱动配置无效");
  if (driver === "mysql" && (!input.bridgeUrl || !input.databaseUrl || !input.bridgeSecret)) throw new Error("MySQL 数据桥接配置无效");
  const file = join(workspace, ".env");
  let content = "";
  try { content = await readFile(file, "utf8"); } catch { /* 首次配置 */ }
  const values = {
    DATABASE_DRIVER: driver,
    ...(driver === "mysql" ? {
      MYSQL_BRIDGE_URL: String(input.bridgeUrl),
      MYSQL_BRIDGE_SECRET: String(input.bridgeSecret),
      DATABASE_URL: String(input.databaseUrl),
    } : {}),
  };
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trim()}\n${line}\n`;
  }
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${content.trim()}\n`, { mode: 0o600 });
  await rename(temporary, file);
  process.env.DATABASE_DRIVER = driver;
  if (driver === "mysql") {
    process.env.DATABASE_URL = String(input.databaseUrl);
    await writeFile(join(workspace, ".backup.env"), `DATABASE_URL=${String(input.databaseUrl)}\n`, { mode: 0o600 });
  }
  if (restart) {
    const restartServices = driver === "mysql" ? ["mysql-bridge", "yehaoproxy", "scheduler"] : ["yehaoproxy", "scheduler"];
    await command("docker", compose("up", "-d", "--force-recreate", ...restartServices));
  }
}

const json = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
};

createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "更新执行器认证失败" });
    if (req.method === "GET" && req.url === "/status") return json(res, 200, { ready: true, running, history: await history(), backupDirectory: backupRoot });
    if (req.method === "GET" && req.url?.startsWith("/backup/")) {
      const id = decodeURIComponent(req.url.slice(8));
      const record = (await history()).find((item) => item.id === id);
      if (!record?.archive || !existsSync(record.archive)) return json(res, 404, { error: "备份文件不存在" });
      res.writeHead(200, {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${record.fileName || `${id}.tar.gz`}"`,
        "x-backup-checksum": record.checksum || "",
      });
      return createReadStream(record.archive).pipe(res);
    }
    if (req.method === "POST" && req.url === "/import") {
      if (running) return json(res, 409, { error: "已有任务正在执行" });
      return json(res, 201, { ok: true, record: await importBackup(req, String(req.headers["x-backup-filename"] || "")) });
    }
    if (req.method !== "POST") return json(res, 404, { error: "接口不存在" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 2_000_000) throw new Error("请求过大");
    }
    const body = JSON.parse(raw || "{}");
    if (running) return json(res, 409, { error: "已有任务正在执行" });
    if (body.action === "configure-database") {
      await configureDatabase(body, { restart: false });
      json(res, 202, { ok: true, message: "数据库配置已保存，正在重启应用" });
      setTimeout(() => configureDatabase(body).catch((error) => console.error("database restart failed", error)), 250);
      return;
    }
    if (body.action === "backup") {
      running = true;
      try { return json(res, 201, { ok: true, record: await backup("", "manual") }); }
      finally { running = false; }
    }
    if (body.action === "rollback") {
      void rollback(String(body.backupId || "")).catch((error) => console.error("restore failed", error));
      return json(res, 202, { ok: true, message: "恢复任务已受理" });
    }
    if (body.action === "update") {
      void update(body).catch((error) => console.error("update failed", error));
      return json(res, 202, { ok: true, message: "更新任务已受理，正在备份当前系统" });
    }
    return json(res, 400, { error: "未知操作" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : "执行失败" });
  }
}).listen(port, "0.0.0.0", () => console.log(`update runner listening on ${port}`));
