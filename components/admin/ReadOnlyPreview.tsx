"use client";
import { useEffect } from "react";
export function ReadOnlyPreview() {
  useEffect(() => {
    const root = document.querySelector(".user-preview-main");
    if (!root) return;
    const disableWrites = () => {
      root.querySelectorAll<HTMLFormElement>("form").forEach(form => {
        if (form.closest(".user-preview-banner") || form.method.toLowerCase() === "get") return;
        form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea").forEach(control => {
          if (!control.disabled) { control.disabled = true; control.title = "Náhled uživatele je pouze pro čtení."; }
        });
      });
    };
    disableWrites();
    const observer = new MutationObserver(disableWrites);
    observer.observe(root, {childList:true,subtree:true});
    return () => observer.disconnect();
  }, []);
  return null;
}
