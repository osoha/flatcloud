"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function DismissibleDetails({ className = "", summary, dialogLabel, children }: { className?: string; summary: React.ReactNode; dialogLabel: string; children: React.ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function close(restoreFocus = true) {
    const details = detailsRef.current;
    if (!details?.open) return;
    details.open = false;
    if (restoreFocus) summaryRef.current?.focus();
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <details ref={detailsRef} className={`${className} dismissible-details`.trim()} onToggle={(event) => {
    if (event.currentTarget.open) requestAnimationFrame(() => closeButtonRef.current?.focus());
  }}>
    <summary ref={summaryRef}>{summary}</summary>
    <div className="dismissible-details-panel" role="dialog" aria-label={dialogLabel}>
      <div className="dismissible-details-head"><strong>{dialogLabel}</strong><button ref={closeButtonRef} className="dismissible-details-close" type="button" onClick={() => close()}><X size={14}/> Zavřít</button></div>
      <div className="dismissible-details-content">{children}</div>
    </div>
  </details>;
}
