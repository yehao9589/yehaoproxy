import { NextResponse } from "next/server";
import { isSuperAdmin, requireAdminApi } from "../../../../lib/admin-auth";
import { audit } from "../../../../lib/audit";
import {
  defaultUpdateSettings,
  getUpdateSettings,
  saveUpdateSettings,
  type UpdateSettings,
} from "../../../../lib/update-center";

const currentVersion = process.env.APP_VERSION || process.env.IMAGE_TAG || "0.1.0-dev";
type ExecutorResult={error?:string;record?:{id?:string;[key:string]:unknown};[key:string]:unknown};

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

const webhookHeaders=():Record<string,string>=>process.env.UPDATE_WEBHOOK_TOKEN?{authorization:`Bearer ${process.env.UPDATE_WEBHOOK_TOKEN}`}:{ };

export async function GET(request:Request) {
  if (!(await requireAdminApi("settings"))) {
    return NextResponse.json({ error: "无更新中心权限" }, { status: 403 });
  }
  const downloadId=text(new URL(request.url).searchParams.get("download"),80);
  if(downloadId){
    if(!process.env.UPDATE_WEBHOOK_URL)return NextResponse.json({error:"备份执行器尚未配置"},{status:409});
    const response=await fetch(`${process.env.UPDATE_WEBHOOK_URL.replace(/\/$/,"")}/backup/${encodeURIComponent(downloadId)}`,{headers:webhookHeaders()});
    if(!response.ok)return NextResponse.json({error:"备份文件不存在或无法下载"},{status:response.status});
    return new Response(response.body,{status:200,headers:{"content-type":"application/gzip","content-disposition":response.headers.get("content-disposition")||`attachment; filename="${downloadId}.tar.gz"`,"x-backup-checksum":response.headers.get("x-backup-checksum")||""}});
  }
  let executor: {ready:boolean;running:boolean;history:unknown[];backupDirectory?:string} = {ready:false,running:false,history:[]};
  if (process.env.UPDATE_WEBHOOK_URL) {
    try {
      const response = await fetch(`${process.env.UPDATE_WEBHOOK_URL.replace(/\/$/, "")}/status`, {
        headers: process.env.UPDATE_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.UPDATE_WEBHOOK_TOKEN}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) executor = await response.json();
    } catch { /* executor remains unavailable */ }
  }
  return NextResponse.json({
    source: {
      repository: defaultUpdateSettings.repository,
      image: process.env.IMAGE_REPOSITORY || defaultUpdateSettings.image,
      channel: process.env.UPDATE_CHANNEL || defaultUpdateSettings.channel,
    },
    runtime: {
      currentVersion,
      image: process.env.IMAGE_REPOSITORY || "",
      imageTag: process.env.IMAGE_TAG || "",
      commit: process.env.APP_COMMIT || "",
      deployment: process.env.CONTAINER ? "Docker 容器" : "未识别",
      updateWebhookReady: Boolean(process.env.UPDATE_WEBHOOK_URL),
      checkedAt: new Date().toISOString(),
    },
    executor,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminApi("settings");
  if (!admin) return NextResponse.json({ error: "无更新中心权限" }, { status: 403 });
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: "仅超级管理员可以修改或触发系统更新" }, { status: 403 });
  }
  const contentType=request.headers.get("content-type")||"";
  if(contentType.includes("application/gzip")){
    const webhook=process.env.UPDATE_WEBHOOK_URL,fileName=text(request.headers.get("x-backup-filename"),160);
    if(!webhook)return NextResponse.json({error:"备份执行器尚未配置"},{status:409});
    if(!fileName.toLowerCase().endsWith(".tar.gz"))return NextResponse.json({error:"只支持 .tar.gz 备份文件"},{status:400});
    const response=await fetch(`${webhook.replace(/\/$/,"")}/import`,{method:"POST",headers:{...webhookHeaders(),"content-type":"application/gzip","x-backup-filename":fileName,...(request.headers.get("content-length")?{"content-length":request.headers.get("content-length")!}:{})},body:request.body});
    const result=await response.json().catch(()=>({})) as ExecutorResult;if(!response.ok)return NextResponse.json({error:result.error||"备份文件导入失败"},{status:502});
    await audit(admin,"backup.import","system_backup",result.record?.id||null,{fileName},request);return NextResponse.json(result,{status:201});
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
  if(action==="backup"){
    const webhook=process.env.UPDATE_WEBHOOK_URL;if(!webhook)return NextResponse.json({error:"备份执行器尚未配置"},{status:409});
    const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json",...webhookHeaders()},body:JSON.stringify({action:"backup",requestedBy:admin.email})});const result=await response.json().catch(()=>({})) as ExecutorResult;
    if(!response.ok)return NextResponse.json({error:result.error||"创建备份失败"},{status:502});await audit(admin,"backup.create","system_backup",result.record?.id||null,result.record||{},request);return NextResponse.json(result,{status:201});
  }
  if (action === "check") {
    const manifestUrl=process.env.UPDATE_MANIFEST_URL||defaultUpdateSettings.manifestUrl;
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (process.env.GITEE_ACCESS_TOKEN) headers.Authorization = `token ${process.env.GITEE_ACCESS_TOKEN}`;
      const response = await fetch(manifestUrl, { headers, cache: "no-store" });
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
        releases: Array.isArray(manifest.releases) ? manifest.releases.slice(0, 20) : [],
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
      body: JSON.stringify({ action: "update", image: settings.image, channel: settings.channel, requestedBy: admin.email }),
    });
    if (!response.ok) return NextResponse.json({ error: `容器编排接口返回 ${response.status}` }, { status: 502 });
    await audit(admin, "update.trigger", "system_update", settings.image, { channel: settings.channel }, request);
    return NextResponse.json({ ok: true, message: "更新任务已提交给容器编排服务" });
  }
  if (action === "rollback") {
    const webhook = process.env.UPDATE_WEBHOOK_URL;
    const backupId = text(body.backupId, 80);
    if (!webhook) return NextResponse.json({ error: "更新执行器尚未配置" }, { status: 409 });
    if (!backupId) return NextResponse.json({ error: "请选择需要恢复的备份" }, { status: 400 });
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.UPDATE_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.UPDATE_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ action: "rollback", backupId, requestedBy: admin.email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: result.error || `回滚执行器返回 ${response.status}` }, { status: 502 });
    await audit(admin, "update.rollback", "system_update", backupId, result.record || {}, request);
    return NextResponse.json({ ok: true, message: "已恢复所选备份版本", record: result.record });
  }
  if (action === "delete-backup") {
    const webhook = process.env.UPDATE_WEBHOOK_URL;
    const backupId = text(body.backupId, 80);
    if (!webhook) return NextResponse.json({ error: "备份服务尚未配置" }, { status: 409 });
    if (!backupId) return NextResponse.json({ error: "请选择需要删除的备份" }, { status: 400 });
    const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json", ...webhookHeaders() }, body: JSON.stringify({ action: "delete-backup", backupId, requestedBy: admin.email }) });
    const result = await response.json().catch(() => ({})) as ExecutorResult;
    if (!response.ok) return NextResponse.json({ error: result.error || "删除备份失败" }, { status: response.status });
    await audit(admin, "backup.delete", "system_backup", backupId, {}, request);
    return NextResponse.json({ ok: true, message: "备份已删除" });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
