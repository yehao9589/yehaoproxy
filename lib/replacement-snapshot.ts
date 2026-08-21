type ReplacementAsset = {
  host: string;
  port: number;
  username?: string | null;
  wifiName?: string | null;
  protocol?: string | null;
  note?: string | null;
};

export type ReplacementSnapshot = {
  address: string;
  username: string | null;
  wifiName: string | null;
  protocol: string | null;
  country: string | null;
  city: string | null;
};

const tags = {
  address: "PREVIOUS_PROXY_ADDRESS",
  username: "PREVIOUS_PROXY_USERNAME",
  wifiName: "PREVIOUS_PROXY_WIFI",
  protocol: "PREVIOUS_PROXY_PROTOCOL",
  country: "PREVIOUS_PROXY_COUNTRY",
  city: "PREVIOUS_PROXY_CITY",
} as const;

const lineValue = (value: unknown) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
const tagged = (text: unknown, tag: string) => String(text || "").match(new RegExp(`\\[${tag}\\]([^\\n]*)`))?.[1]?.trim() || "";

export function replacementSnapshotLines(asset: ReplacementAsset, country: string) {
  const city = asset.note?.match(/\[CITY\]([^\n]*)/)?.[1]?.trim() || "";
  return [
    `[${tags.address}]${lineValue(asset.host)}:${asset.port}`,
    `[${tags.username}]${lineValue(asset.username)}`,
    `[${tags.wifiName}]${lineValue(asset.wifiName)}`,
    `[${tags.protocol}]${lineValue(asset.protocol)}`,
    `[${tags.country}]${lineValue(country)}`,
    `[${tags.city}]${lineValue(city)}`,
  ].join("\n");
}

export function parseReplacementSnapshot(text: unknown): ReplacementSnapshot | null {
  const address = tagged(text, tags.address);
  if (!address) return null;
  return {
    address,
    username: tagged(text, tags.username) || null,
    wifiName: tagged(text, tags.wifiName) || null,
    protocol: tagged(text, tags.protocol) || null,
    country: tagged(text, tags.country) || null,
    city: tagged(text, tags.city) || null,
  };
}

export function stripReplacementSnapshot(text: unknown) {
  let value = String(text || "");
  for (const tag of Object.values(tags)) value = value.replace(new RegExp(`\\n?\\[${tag}\\][^\\n]*`, "g"), "");
  return value.trim();
}
