"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "flatcloud:sidebar-collapsed";

export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const next = window.localStorage.getItem(KEY) === "1";
    setCollapsed(next);
    document.documentElement.classList.toggle("fc-sidebar-collapsed", next);
    return () => document.documentElement.classList.remove("fc-sidebar-collapsed");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(KEY, next ? "1" : "0");
    document.documentElement.classList.toggle("fc-sidebar-collapsed", next);
  }

  return <button
    className="sidebar-collapse-toggle"
    type="button"
    aria-label={collapsed ? "Rozbalit levé menu" : "Sbalit levé menu"}
    title={collapsed ? "Rozbalit menu" : "Sbalit menu"}
    aria-pressed={collapsed}
    onClick={toggle}
  >
    {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}
    <span>{collapsed ? "Rozbalit" : "Sbalit"}</span>
  </button>;
}
