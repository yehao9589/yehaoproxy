import { spawn } from "node:child_process";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDirectory = join(root, "dist", "server");
const variablesFile = join(serverDirectory, ".dev.vars");
const runtimeEntryFile = join(serverDirectory, ".vinext-worker-entry.mjs");
const runtimeConfigFile = join(serverDirectory, "wrangler.runtime.json");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const allowed = /^(DATABASE_DRIVER|INVENTORY_|INSTALL_|CRON_|XPANEL_|UPDATE_|PUBLIC_|APP_|IMAGE_|EMAIL_|RESEND_|SMTP_|SMS_)/;
const values = { ...process.env, DATABASE_DRIVER: "sqlite" };
const content = Object.entries(values)
  .filter(([key, value]) => allowed.test(key) && value !== undefined)
  .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
  .join("\n");

await writeFile(variablesFile, `${content}\n`, { mode: 0o600 });
await chmod(variablesFile, 0o600).catch(() => {});

// Keep the runtime entry explicit so the generated bundle remains immutable
// while Wrangler receives vinext's complete Worker fetch object.
await writeFile(runtimeEntryFile, [
  'import worker from "./index.js";',
  "export default worker;",
  "",
].join("\n"));
const generatedConfig = JSON.parse(await readFile(join(serverDirectory, "wrangler.json"), "utf8"));
generatedConfig.main = ".vinext-worker-entry.mjs";
await writeFile(runtimeConfigFile, `${JSON.stringify(generatedConfig)}\n`);

const child = spawn(process.execPath, [
  wrangler,
  "dev",
  "--config", "wrangler.runtime.json",
  "--ip", "0.0.0.0",
  "--port", String(process.env.PORT || 3000),
  "--persist-to", join(root, ".wrangler", "state"),
], {
  cwd: serverDirectory,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: "",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(root, ".wrangler", "logs"),
    XDG_CONFIG_HOME: join(root, ".wrangler", "config"),
  },
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

child.on("error", async (error) => {
  console.error("SQLite 运行时启动失败", error);
  await cleanup();
  process.exit(1);
});
child.on("exit", async (code, signal) => {
  await cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

async function cleanup() {
  await Promise.all([
    unlink(variablesFile).catch(() => {}),
    unlink(runtimeEntryFile).catch(() => {}),
    unlink(runtimeConfigFile).catch(() => {}),
  ]);
}
