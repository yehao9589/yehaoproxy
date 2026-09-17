"use client";

import { useEffect, useRef, useState } from "react";

let pending: Promise<number> | null = null;
const validSize = (value: unknown) => [10, 20, 50, 100].includes(Number(value)) ? Number(value) : 20;

function readDefault() {
  if (!pending) {
    pending = fetch("/api/site-config", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("加载分页设置失败");
        return validSize((await response.json()).defaultPageSize);
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Each list can override the site default for its current mount. */
export function usePageSize() {
  const [size, setSize] = useState(20);
  const overridden = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readDefault().then(value => {
        if (active && !overridden.current) setSize(value);
      }).catch(() => {});
    };
    const update = (event: Event) => {
      const value = (event as CustomEvent<{ defaultPageSize?: number }>).detail?.defaultPageSize;
      if (value !== undefined && !overridden.current) setSize(validSize(value));
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("site-config-updated", update);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("site-config-updated", update);
    };
  }, []);
  return [size, (value: number) => {
    overridden.current = true;
    setSize(validSize(value));
  }] as const;
}
