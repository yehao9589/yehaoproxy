import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemOptions } from "../db/schema";
import { setSystemOption } from "./db-upsert";

export type UpdateSettings = {
  deploymentMode: "docker" | "manual";
  repository: string;
  branch: string;
  image: string;
  channel: "stable" | "beta";
  manifestUrl: string;
  autoCheck: boolean;
};

export const defaultUpdateSettings: UpdateSettings = {
  deploymentMode: "docker",
  repository: "https://github.com/yehao9589/yehaoproxy",
  branch: "main",
  image: "ghcr.io/yehao9589/yehaoproxy:v1.0.0",
  channel: "stable",
  manifestUrl: "https://raw.githubusercontent.com/yehao9589/yehaoproxy/main/public/releases.json",
  autoCheck: true,
};

const KEY = "update_center";

export async function getUpdateSettings(): Promise<UpdateSettings> {
  const [row] = await getDb().select().from(systemOptions).where(eq(systemOptions.key, KEY)).limit(1);
  if (!row) return defaultUpdateSettings;
  try {
    return { ...defaultUpdateSettings, ...JSON.parse(row.value) };
  } catch {
    return defaultUpdateSettings;
  }
}

export async function saveUpdateSettings(value: UpdateSettings) {
  const now = new Date();
  const json = JSON.stringify(value);
  await setSystemOption(KEY, json, now);
}
