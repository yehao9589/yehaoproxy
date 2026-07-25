import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { audit } from "../../../../lib/audit";
import { getSiteConfig, saveSiteConfig } from "../../../../lib/site-config";

const allowedTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function uploadDirectory() {
  const projectRoot = process.env.SITE_PROJECT_ROOT || process.env.INIT_CWD || process.cwd();
  return process.env.SITE_UPLOAD_DIR || path.join(projectRoot, "public", "uploads", "site");
}

function localLogoPath(url: string) {
  if (!/^\/uploads\/site\/logo-[a-zA-Z0-9.-]+$/.test(url)) return null;
  return path.join(uploadDirectory(), path.basename(url));
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi("settings");
    if (!admin) return NextResponse.json({ error: "无站务管理权限" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.data !== "string" || typeof body.type !== "string") {
      return NextResponse.json({ error: "请选择 Logo 图片" }, { status: 400 });
    }
    const extension = allowedTypes[body.type];
    if (!extension) {
      return NextResponse.json({ error: "仅支持 PNG、JPG、WEBP 图片" }, { status: 400 });
    }
    const encoded = body.data.includes(",") ? body.data.slice(body.data.indexOf(",") + 1) : body.data;
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length) {
      return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
    }
    if (bytes.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo 图片不能超过 2MB" }, { status: 400 });
    }

    const config = await getSiteConfig();
    const previous = localLogoPath(config.logoUrl);
    let storage: "filesystem" | "database" = "filesystem";
    try {
      const directory = uploadDirectory();
      await mkdir(directory, { recursive: true });
      const filename = `logo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
      await writeFile(path.join(directory, filename), bytes);
      config.logoUrl = `/uploads/site/${filename}`;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      const message = error instanceof Error ? error.message : "";
      if (!["EPERM", "EACCES", "EROFS"].includes(code) && !/not permitted|read-only|access/i.test(message)) throw error;
      storage = "database";
      config.logoUrl = `data:${body.type};base64,${bytes.toString("base64")}`;
    }
    await saveSiteConfig(config);
    if (previous) await unlink(previous).catch(() => undefined);
    await audit(admin, "site.logo.upload", "site_config", "site_config", { type: body.type, size: bytes.length, storage }, request);
    return NextResponse.json({ ok: true, logoUrl: config.logoUrl, storage });
  } catch (error) {
    console.error("site logo upload failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Logo 上传失败：${detail}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdminApi("settings");
  if (!admin) return NextResponse.json({ error: "无站务管理权限" }, { status: 403 });
  const config = await getSiteConfig();
  const previous = localLogoPath(config.logoUrl);
  config.logoUrl = "";
  await saveSiteConfig(config);
  if (previous) await unlink(previous).catch(() => undefined);
  await audit(admin, "site.logo.delete", "site_config", "site_config", {}, request);
  return NextResponse.json({ ok: true });
}
