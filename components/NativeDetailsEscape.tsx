"use client";

import { useEffect } from "react";

export function NativeDetailsEscape() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Native modal dialogs own Escape, even when a disabled refresh button
      // has temporarily moved focus to the body. Never consume their cancel.
      if (document.querySelector("dialog[open]")) return;
      const focused = document.activeElement instanceof Element
        ? document.activeElement.closest<HTMLDetailsElement>("details[open]:not(.dismissible-details)")
        : null;
      const open = focused || Array.from(document.querySelectorAll<HTMLDetailsElement>("details[open]:not(.dismissible-details)")).at(-1);
      if (!open) return;
      event.preventDefault();
      open.open = false;
      open.querySelector<HTMLElement>(":scope > summary")?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
