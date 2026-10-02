"use client";

import { useEffect, useRef } from "react";

/** Keep all unit modules reachable from summary links, bookmarks and back navigation. */
export function BasicUnitDetails({ children }: { children: React.ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      let id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* malformed bookmarks are harmless */ }
      const target = document.getElementById(id);
      if (!target || !details.current?.contains(target)) return;
      details.current.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      const target = document.getElementById(link.hash.slice(1));
      if (target && details.current?.contains(target)) details.current.open = true;
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", click);
    return () => { window.removeEventListener("hashchange", reveal); document.removeEventListener("click", click); };
  }, []);
  return <details className="basic-unit-details" ref={details}><summary><strong>Další údaje o jednotce</strong><span>Osoby · Platby · Dokumenty · Vlastník · Technický stav</span></summary><div className="basic-unit-details-body">{children}</div></details>;
}
