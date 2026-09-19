"use client";

import { useRef, useState } from "react";

export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);

  const scheduleSubmit = (target: EventTarget & (HTMLInputElement | HTMLSelectElement)) => {
    if (target instanceof HTMLInputElement && ["hidden", "submit"].includes(target.type)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(true);
    timerRef.current = setTimeout(() => formRef.current?.requestSubmit(), target instanceof HTMLSelectElement || target.type === "radio" ? 80 : 500);
  };

  return <form ref={formRef} method="get" action="/reporty" className={className} onChange={(event) => scheduleSubmit(event.target as EventTarget & (HTMLInputElement | HTMLSelectElement))} onSubmit={() => setPending(true)}>
    {children}
    <span className="forecast-auto-status" aria-live="polite">{pending ? "Přepočítávám…" : "Změny se přepočítají automaticky"}</span>
  </form>;
}
