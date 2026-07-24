"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";

export default function AdminLogoutButton() {
  const [target, setTarget] = useState<Element | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTarget(document.querySelector(".admin-pro .admin-user"));
  }, []);

  async function logout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {method: "POST"});
      if (!response.ok) throw new Error("退出失败");
      location.replace("/login");
    } catch {
      setLoading(false);
      setError("退出失败，请重试");
    }
  }

  if (!target) return null;
  return createPortal(
    <button className="admin-logout-button" onClick={logout} disabled={loading} title={error || "退出管理后台"}>
      <span>↪</span>{loading ? "退出中" : "退出"}
    </button>,
    target,
  );
}
