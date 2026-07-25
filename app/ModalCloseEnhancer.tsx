"use client";

import { useEffect } from "react";

const overlaySelector = [
  ".modal",
  "[class*='-mask']",
  "[class*='-overlay']",
  ".customer-drawer-mask",
  ".order-workspace-mask",
].join(",");

function enhance(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    const label = button.textContent?.trim();
    if (label !== "×" && label !== "✕" && label !== "关闭") return;
    if (!button.closest(overlaySelector)) return;
    if (label === "关闭" && !button.closest("header")) return;
    button.classList.add("unified-modal-close");
    button.type = "button";
    button.setAttribute("aria-label", "关闭窗口");
    button.title = "关闭";
  });
}

export default function ModalCloseEnhancer() {
  useEffect(() => {
    enhance();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches("button")) enhance(node.parentElement || document);
          else enhance(node);
        }
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const candidates = [...document.querySelectorAll<HTMLButtonElement>(".unified-modal-close")]
        .filter(button => button.offsetParent !== null && !button.disabled);
      const button = candidates.at(-1);
      if (button) {
        event.preventDefault();
        button.click();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
