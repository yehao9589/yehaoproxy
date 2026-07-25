import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { audit } from "../../../../lib/audit";
import {
  defaultUpdateSettings,
  getUpdateSettings,
  saveUpdateSettings,
  type UpdateSettings,
} from "../../../../lib/update-center";

const currentVersion = process.env.APP_VERSION || process.env.IMAGE_TAG || "0.1.0-dev";

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET() {
  if (!(await requireAdminApi("settings"))) {
    return NextResponse.json({ error: "无更新中心权限" }, { status: 403 });
  }
  return NextResponse.json({
    settings: await getUpdateSettings(),
    runtime: {
      currentVersion,
      image: process.env.IMAGE_REPOSITORY || "",
      imageTag: process.env.IMAGE_TAG || "",
      commit: process.env.APP_COMMIT || "",
      deployment: process.env.CONTAINER ? "Docker 容器" : "未识别",
      updateWebhookReady: Boolean(process.env.UPDATE_WEBHOOK_URL),
      checkedAt: new Date().toISOString(),
    },
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminApi("settings");
  if (!admin) return NextResponse.json({ error: "无更新中心权限" }, { status: 403 });
  if (admin.email.toLowerCase() !== "admin") {
    return NextResponse.json({ error: "仅超级管理员可以修改或触发系统更新" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const action = text(body.action, 20);

  if (action === "save") {
    const value: UpdateSettings = {
      deploymentMode: body.deploymentMode === "manual" ? "manual" : "docker",
      repository: text(body.repository) || defaultUpdateSettings.repository,
      branch: text(body.branch, 80) || "master",
      image: text(body.image, 200),
      channel: body.channel === "beta" ? "beta" : "stable",
      manifestUrl: text(body.manifestUrl),
      autoCheck: Boolean(body.autoCheck),
    };
    for (const url of [value.repository, value.manifestUrl]) {
      if (url && !/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: "仓库和版本清单必须使用 HTTPS 地址" }, { status: 400 });
      }
    }
    await saveUpdateSettings(value);
    await audit(admin, "update.settings.save", "system_update", null, value, request);
    return NextResponse.json({ ok: true, settings: value });
  }

  const settings = await getUpdateSettings();
  if (action === "check") {
    if (!settings.manifestUrl) {
      return NextResponse.json({ error: "请先配置版本清单地址" }, { status: 400 });
    }
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (process.env.GITEE_ACCESS_TOKEN) headers.Authorization = `token ${process.env.GITEE_ACCESS_TOKEN}`;
      const response = await fetch(settings.manifestUrl, { headers, cache: "no-store" });
      if (!response.ok) throw new Error(`远程服务器返回 ${response.status}`);
      const manifest = await response.json();
      const remoteVersion = text(manifest.version, 60);
      if (!remoteVersion) throw new Error("版本清单缺少 version 字段");
      await audit(admin, "update.check", "system_update", remoteVersion, { currentVersion }, request);
      return NextResponse.json({
        ok: true,
        currentVersion,
        remoteVersion,
        hasUpdate: remoteVersion !== currentVersion,
        releaseNotes: text(manifest.releaseNotes || manifest.notes, 4000),
        image: text(manifest.image, 300),
        publishedAt: text(manifest.publishedAt, 80),
      });
    } catch (error) {
      return NextResponse.json({ error: `检查更新失败：${error instanceof Error ? error.message : "未知错误"}` }, { status: 502 });
    }
  }

  if (action === "trigger") {
    const webhook = process.env.UPDATE_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json({ error: "服务器尚未配置 UPDATE_WEBHOOK_URL，不能远程触发容器更新" }, { status: 409 });
    }
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.UPDATE_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.UPDATE_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ image: settings.image, channel: settings.channel, requestedBy: admin.email }),
    });
    if (!response.ok) return NextResponse.json({ error: `容器编排接口返回 ${response.status}` }, { status: 502 });
    await audit(admin, "update.trigger", "system_update", settings.image, { channel: settings.channel }, request);
    return NextResponse.json({ ok: true, message: "更新任务已提交给容器编排服务" });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
