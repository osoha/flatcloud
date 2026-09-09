"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Uses the same authorized variant endpoint as the old link; no public asset URLs. */
export function DocumentImagePreview({ documentId, title }: { documentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="document-preview-trigger" aria-haspopup="dialog" aria-label={`Otevřít náhled: ${title}`} onClick={() => { setFailed(false); setOpen(true); }}>
      <img loading="lazy" src={`/api/documents/${documentId}/download?variant=thumbnail`} alt=""/>
    </button>
    {open && createPortal(<dialog ref={dialog} className="document-preview-dialog" aria-labelledby={titleId} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }} onPointerDown={(event) => event.stopPropagation()} onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
      <div className="document-preview-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="secondary document-preview-close" autoFocus aria-label="Zavřít náhled" onClick={() => setOpen(false)}><X size={20} aria-hidden="true"/><span>Zavřít</span></button>
      </div>
      <div className="document-preview-body">
        {failed ? <div role="alert"><p>Náhled se nepodařilo načíst. Soubor může být nedostupný nebo k němu již nemáte přístup.</p><button type="button" className="secondary" onClick={() => { setAttempt(value => value + 1); setFailed(false); }}>Zkusit znovu</button></div>
          : <img key={attempt} src={`/api/documents/${documentId}/download?variant=preview`} alt={title} onError={() => setFailed(true)}/>}
      </div>
    </dialog>, document.body)}
  </>;
}
