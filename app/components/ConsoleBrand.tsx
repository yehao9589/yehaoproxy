"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConsoleBrandConfig } from "../../lib/site-config";

function usableLogo(url: string) {
  if (!/^data:image\/png;base64,/i.test(url)) return url;
  // A previously truncated PNG may render only its top rows without an error event.
  try {
    return atob(url.slice(url.indexOf(",") + 1)).endsWith("\u0000\u0000\u0000\u0000IEND\u00aeB\u0060\u0082") ? url : "";
  } catch {
    return "";
  }
}

export default function ConsoleBrand({ brand }: { brand: ConsoleBrandConfig }) {
  const [updated, setUpdated] = useState<ConsoleBrandConfig>();
  useEffect(() => {
    const update = (event: Event) => setUpdated((event as CustomEvent<ConsoleBrandConfig>).detail);
    window.addEventListener("site-config-updated", update);
    return () => window.removeEventListener("site-config-updated", update);
  }, []);
  const { siteName, logoText, logoUrl } = updated ?? brand;
  const src = useMemo(() => usableLogo(logoUrl), [logoUrl]);
  return <a className="brand console-brand" href="/">
    <BrandMark key={src} src={src} text={logoText || "Y"} />
    <b>{siteName}</b>
  </a>;
}

function BrandMark({ src, text }: { src: string; text: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return <span aria-hidden="true" className={`console-brand-mark${showImage ? " has-logo" : ""}`}>
    {showImage
      // Configured logos can use storage URLs and do not need image optimization.
      ? <img src={src} alt="" onError={() => setFailed(true)} />
      : text}
  </span>;
}
