"use client";
import { useState } from "react";
import SettingsClient from "./SettingsClient";
import AdminAccounts from "./AdminAccounts";

export default function SystemSettings() {
  const [view, setView] = useState<"config" | "admins">("config");
  return <div><div className="admin-tabs"><button className={view === "config" ? "on" : ""} onClick={() => setView("config")}>系统配置</button><button className={view === "admins" ? "on" : ""} onClick={() => setView("admins")}>管理员账户</button></div>{view === "config" ? <SettingsClient/> : <AdminAccounts/>}</div>;
}
