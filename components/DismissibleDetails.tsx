"use client";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function DismissibleDetails({ className = "", summary, dialogLabel, children, viewportModal = false }: { className?: string; summary: React.ReactNode; dialogLabel: string; children: React.ReactNode; viewportModal?: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  function close() { dialogRef.current?.close(); if (detailsRef.current) detailsRef.current.open = false; setOpen(false); summaryRef.current?.focus(); }
  useEffect(() => { setMounted(true); }, []);
  useLayoutEffect(() => {
    if (!open || !viewportModal) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, [open, viewportModal]);
  useEffect(() => {
    if (!open || viewportModal) return;
    function key(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    function outside(event: PointerEvent) { if (event.target instanceof Node && !detailsRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) close(); }
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [open, viewportModal]);
  const panel = <div ref={panelRef} className="dismissible-details-panel" role={viewportModal ? undefined : "dialog"} aria-label={viewportModal ? undefined : dialogLabel}><div className="dismissible-details-head"><strong>{dialogLabel}</strong><button className="dismissible-details-close" type="button" onClick={close} autoFocus><X size={14}/> Zavřít</button></div><div className="dismissible-details-content">{children}</div></div>;
  return <><details ref={detailsRef} className={`${className} dismissible-details${viewportModal ? " viewport-modal" : ""}`.trim()} onToggle={event => { if (!viewportModal) setOpen(event.currentTarget.open); }}><summary ref={summaryRef} onClick={event => { if (!viewportModal) return; event.preventDefault(); if (open) close(); else { if (detailsRef.current) detailsRef.current.open = true; setOpen(true); } }}>{summary}</summary>{!viewportModal && panel}</details>{viewportModal && mounted && open && createPortal(<dialog ref={dialogRef} className={`fb-modal ${className}`} aria-label={dialogLabel} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>{panel}</dialog>, document.body)}</>;
}
