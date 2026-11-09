"use client";

import { useEffect, useRef, useState } from "react";

const narrowConsole = "(max-width: 760px)";

export default function useConsoleMobileMenu(bodyClass: string) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const media = window.matchMedia(narrowConsole);
    const trigger = triggerRef.current;
    const closeOnDesktop = () => { if (!media.matches) setMobileMenuOpen(false); };
    if (!media.matches) {
      closeOnDesktop();
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
      } else if (event.key === "Tab") {
        const candidates = drawerRef.current?.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[tabindex]");
        const tabbable = Array.from(candidates || []).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
        const first = tabbable[0], last = tabbable.at(-1);
        if (!first || !last) return;
        const active = document.activeElement;
        if (!drawerRef.current?.contains(active) || active === (event.shiftKey ? first : last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }
    }

    document.body.classList.add(bodyClass);
    closeRef.current?.focus({ preventScroll: true });
    window.addEventListener("keydown", handleKey);
    media.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.classList.remove(bodyClass);
      window.removeEventListener("keydown", handleKey);
      media.removeEventListener("change", closeOnDesktop);
      if (media.matches && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [bodyClass, mobileMenuOpen]);

  return { mobileMenuOpen, setMobileMenuOpen, drawerRef, triggerRef, closeRef };
}
