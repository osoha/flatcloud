"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export function PortfolioStatusStrip({ userId, items }: { userId: string; items: { label: string; value: string }[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const storageKey = `flatberry:portfolio-status:${userId}`;
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(storageKey) === "collapsed"); }
    catch { /* The strip remains usable when storage is unavailable. */ }
  }, [storageKey]);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, next ? "collapsed" : "expanded"); }
    catch { /* Remembering the preference is optional. */ }
  }
  return <section className="card portfolio-status-strip" aria-labelledby="portfolio-status-heading">
    <div className="portfolio-status-header">
      <h2 id="portfolio-status-heading">Stav portfolia</h2>
      <button type="button" className="secondary portfolio-status-toggle" aria-expanded={!collapsed} aria-controls="portfolio-status-metrics" onClick={toggle}>
        {collapsed ? "Rozbalit" : "Sbalit"}<ChevronDown size={16} aria-hidden="true"/>
      </button>
    </div>
    <dl id="portfolio-status-metrics" className="portfolio-status-metrics" hidden={collapsed}>
      {items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>
  </section>;
}
