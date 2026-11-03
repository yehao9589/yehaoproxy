"use client";

import {useEffect, useState} from "react";
import type {WifiNameConflict} from "@/lib/wifi-name";

type Check = {key: string; count: number; duplicates: WifiNameConflict[]; failed?: boolean};

export default function WifiNameDuplicateHint({orderId, name, excludeAllocationId}: {
  orderId: string; name: string; excludeAllocationId?: string;
}) {
  const key = JSON.stringify([orderId, name.trim(), excludeAllocationId || ""]);
  const [check, setCheck] = useState<Check | null>(null);
  useEffect(() => {
    if (!orderId || !name.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({name: name.trim(), ...(excludeAllocationId ? {excludeAllocationId} : {})});
        const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/wifi-name?${query}`, {cache: "no-store", signal: controller.signal});
        const data = await response.json();
        if (!response.ok) throw new Error("重名检查失败");
        if (!controller.signal.aborted) setCheck({key, count: data.count, duplicates: data.duplicates || []});
      } catch {
        if (!controller.signal.aborted) setCheck({key, count: 0, duplicates: [], failed: true});
      }
    }, 300);
    return () => {window.clearTimeout(timer); controller.abort()};
  }, [orderId, name, excludeAllocationId, key]);
  if (!name.trim() || !check || check.key !== key) return null;
  if (check.failed) return <small className="wifi-name-check-note" role="status">暂时无法检查重名，保存时会再次核对。</small>;
  if (!check.count) return null;
  return <small className="wifi-name-duplicate-warning" role="status" aria-live="polite">
    <b>注意：该客户已有 {check.count} 个其他服务使用此 WiFi 名称</b>
    {check.duplicates.map(item => <span key={item.id}>{item.address} · {item.orderId}{item.status !== "active" ? "（历史服务）" : ""}</span>)}
    {check.count > check.duplicates.length && <span>另有 {check.count - check.duplicates.length} 条重名记录</span>}
    <span>建议修改以便区分，也可保留此名称继续保存。</span>
  </small>;
}
