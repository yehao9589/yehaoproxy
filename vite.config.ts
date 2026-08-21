import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    DATABASE_DRIVER: process.env.DATABASE_DRIVER || "sqlite",
    MYSQL_BRIDGE_URL: process.env.MYSQL_BRIDGE_URL || "",
    MYSQL_BRIDGE_SECRET: process.env.MYSQL_BRIDGE_SECRET || "",
    XPANEL_BRIDGE_URL: process.env.XPANEL_BRIDGE_URL || "",
    XPANEL_BRIDGE_SECRET: process.env.XPANEL_BRIDGE_SECRET || "",
    CRON_SECRET: process.env.CRON_SECRET || "",
  },
  d1_databases: process.env.DATABASE_DRIVER === "mysql" ? [] : d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  // Local previews must not depend on Cloudflare's public Request.cf sample.
  // A blocked or proxied connection used to make Vinext hang and then exit.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["yehaoproxy", "localhost", "127.0.0.1"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
      sites(),
    ],
  };
});
