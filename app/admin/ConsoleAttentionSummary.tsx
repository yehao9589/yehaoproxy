"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import ConsoleIcon, {type ConsoleIconName} from "../components/ConsoleIcon";
import {useAdminRefresh} from "./AdminRefresh";
import type {AdminTab} from "./LiveAdmin";
import type {AttentionCounts, AttentionKey} from "../../lib/admin-attention";

const entries: Array<{key:AttentionKey; label:string; permission:string; tab:AdminTab; icon:ConsoleIconName}> = [
  {key:"provision", label:"待开通订单", permission:"orders", tab:"product-orders", icon:"orders"},
  {key:"review", label:"待核验续费", permission:"orders", tab:"renewal-orders", icon:"renew"},
  {key:"expiring", label:"7 天内到期服务", permission:"orders", tab:"services", icon:"calendar"},
  {key:"tickets", label:"待回复工单", permission:"tickets", tab:"tickets", icon:"support"},
];

export default function ConsoleAttentionSummary({permissions, activeTab, onNavigate}:{
  permissions:string[]; activeTab:AdminTab; onNavigate:(tab:AdminTab)=>void;
}) {
  const canOrders = permissions.includes("orders"), canTickets = permissions.includes("tickets");
  const enabled = canOrders || canTickets;
  const [counts, setCounts] = useState<AttentionCounts>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return true;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/attention", {cache:"no-store"});
      if (!response.ok) throw new Error("待办暂时无法加载");
      const data = await response.json() as {counts?:AttentionCounts};
      const keys: AttentionKey[] = [...(canOrders ? ["provision", "review", "expiring"] as const : []), ...(canTickets ? ["tickets"] as const : [])];
      const next: AttentionCounts = {};
      for (const key of keys) {
        const value = data.counts?.[key];
        next[key] = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
      }
      const unavailable = keys.some(key => next[key] === null);
      if (current === sequence.current) { setCounts(next); setFailed(unavailable); }
      return !unavailable;
    } catch {
      if (current === sequence.current) { setCounts({}); setFailed(true); }
      return false;
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [enabled, canOrders, canTickets]);
  useAdminRefresh(load, enabled);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load, activeTab]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("yehao:orders-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("yehao:orders-changed", refresh);
    };
  }, [enabled, load]);
  if (!enabled) return null;
  const visible = entries.filter(entry => permissions.includes(entry.permission));
  const empty = !loading && !failed && visible.every(entry => counts[entry.key] === 0);

  return <section className="console-attention-summary" aria-label="需要关注" aria-busy={loading}>
    <div className="console-attention-heading"><h2><ConsoleIcon name="bell"/>需要关注</h2>
      <button type="button" disabled={loading} aria-label="刷新需要关注的事项" title="刷新待办数量" onClick={() => void load()}><ConsoleIcon name="renew"/></button>
    </div>
    <div className="console-attention-list">{visible.map(entry => {
      const count = counts[entry.key];
      return <button type="button" key={entry.key} onClick={() => onNavigate(entry.tab)}>
        <ConsoleIcon name={entry.icon}/><span>{entry.label}</span>
        <b className={typeof count === "number" && count > 0 ? "has-items" : ""} aria-label={loading ? "正在更新" : typeof count === "number" ? `${count} 条` : "数量暂不可用"}>{loading ? "…" : typeof count === "number" ? new Intl.NumberFormat("zh-CN").format(count) : "—"}</b>
        <ConsoleIcon name="chevron"/>
      </button>;
    })}</div>
    <p className={failed ? "is-error" : empty ? "is-empty" : ""} role="status">{failed ? "部分数量暂不可用，请重试" : empty ? <><ConsoleIcon name="check"/>当前暂无待办</> : "点击查看对应列表"}</p>
  </section>;
}
