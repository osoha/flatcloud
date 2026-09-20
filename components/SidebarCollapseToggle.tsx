"use client";

import Link from "next/link";
import { PanelLeftClose } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const KEY = "flatcloud:sidebar-collapsed";

/** Both controls paint the same bitmap at the same scale; only its clip changes. */
export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const expand = useRef<HTMLButtonElement>(null);
  const collapse = useRef<HTMLButtonElement>(null);
  const changed = useRef(false);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(KEY) === "1"); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("fc-sidebar-collapsed", collapsed);
    if (changed.current) (collapsed ? expand : collapse).current?.focus();
  }, [collapsed]);
  function toggle() {
    changed.current = true;
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* Keep the control usable. */ }
  }
  const bitmap = <span className="flatberry-brand-bitmap" aria-hidden="true"/>;
  return <div className="sidebar-brand-row">
    <Link className="brand flatberry-home" href="/portfolio" aria-label="Flatberry – domovská stránka" title="Flatberry – domovská stránka" hidden={collapsed}>
      <span className="flatberry-brand-clip">{bitmap}</span>
    </Link>
    <button ref={expand} className="flatberry-expand" type="button" aria-label="Rozbalit levé menu" aria-expanded={false} title="Rozbalit menu" onClick={toggle} hidden={!collapsed}>
      <span className="flatberry-brand-clip flatberry-mark-only">{bitmap}</span>
    </button>
    <button ref={collapse} className="sidebar-collapse-toggle" type="button" aria-label="Sbalit levé menu" title="Sbalit menu" aria-expanded={true} onClick={toggle} hidden={collapsed}>
      <PanelLeftClose size={19} aria-hidden="true"/>
    </button>
  </div>;
}
