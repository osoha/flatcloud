"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

type CollapsibleNavGroupProps = {
  id: string;
  label: string;
  activeRoots: string[];
  children: React.ReactNode;
  defaultOpen?: boolean;
};

const storageKey = (id: string) => `flatcloud:nav-group:${id}`;

export function CollapsibleNavGroup({ id, label, activeRoots, children, defaultOpen = false }: CollapsibleNavGroupProps) {
  const pathname = usePathname();
  const panelId = useId();
  const routeActive = activeRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
  const [userOpen, setUserOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey(id));
    if (stored !== null) setUserOpen(stored === "open");
  }, [id]);

  const expanded = routeActive || userOpen;
  const toggle = () => {
    if (routeActive) return;
    const next = !userOpen;
    setUserOpen(next);
    window.localStorage.setItem(storageKey(id), next ? "open" : "closed");
  };

  return <section className={`nav-collapsible-section${routeActive ? " route-active" : ""}`}>
    <button
      type="button"
      className="nav-group-toggle"
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={toggle}
    >
      <span>{label}</span>
      <ChevronDown aria-hidden="true" size={14}/>
    </button>
    <div className="nav-group-items" id={panelId} hidden={!expanded}>{children}</div>
  </section>;
}
