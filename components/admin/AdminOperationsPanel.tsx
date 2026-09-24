"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AdminOperations } from "@/lib/admin-operations";

const number = (value: number) => value.toLocaleString("cs-CZ");
const time = (value: string | Date | null) => value ? new Date(value).toLocaleString("cs-CZ") : "Zatím nezaznamenáno";
function size(value: number | null) {
  if (value === null) return "Není dostupné";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = value > 0 ? Math.min(4, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${(value / 1024 ** index).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function Trend({ history, metric, label }: { history: AdminOperations["history"]; metric: "users" | "activeUsers" | "properties" | "units"; label: string }) {
  if (history.length < 2) return <p className="system-note">{label}: čekáme na další denní měření.</p>;
  const start = Date.parse(history[0].day), end = Date.parse(history[history.length - 1].day);
  const values = history.map(row => row[metric]);
  const min = Math.min(...values), max = Math.max(...values);
  const points = history.map(row => ({ x: 5 + (Date.parse(row.day) - start) / Math.max(1, end - start) * 270, y: 45 - (row[metric] - min) / Math.max(1, max - min) * 35, row }));
  const last = history[history.length - 1];
  const baseline = history.find(row => Date.parse(row.day) === Date.parse(last.day) - 30 * 86_400_000);
  return <figure className="system-trend"><figcaption>{label}<strong>{number(last[metric])}</strong></figcaption>
    <svg viewBox="0 0 280 52" role="img" aria-label={`${label}: ${number(values[0])} až ${number(last[metric])}, ${history[0].day} až ${last.day}`}>
      {points.map((p, i) => <g key={p.row.day}>{i > 0 && Date.parse(p.row.day) - Date.parse(points[i - 1].row.day) === 86_400_000 && <line x1={points[i - 1].x} y1={points[i - 1].y} x2={p.x} y2={p.y}/>}<circle cx={p.x} cy={p.y} r="2"><title>{p.row.day}: {number(p.row[metric])}</title></circle></g>)}
    </svg><small>{baseline ? `Změna za 30 dní: ${last[metric] - baseline[metric] >= 0 ? "+" : ""}${number(last[metric] - baseline[metric])}` : "Pro změnu za 30 dní zatím chybí historie."}</small>
  </figure>;
}

export function AdminOperationsPanel() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AdminOperations | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true; setLoading(true);
      try {
        const response = await fetch("/api/admin/operations", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const next = await response.json();
        if (!controller.signal.aborted) { setData(next); setUnavailable(false); }
      } catch { if (!controller.signal.aborted) setUnavailable(true); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh();
    const interval = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearInterval(interval); controller.abort(); document.removeEventListener("visibilitychange", refresh); document.body.style.overflow = previousOverflow; };
  }, [open, refreshKey]);
  const warning = unavailable || (data && (data.scheduler.state !== "ok" || data.inboxErrors > 0 || data.failedEmails > 0 || !data.snapshotAvailable));
  return <>
    <button ref={trigger} className="system-panel-trigger" type="button" aria-label="Přehled systému" aria-haspopup="dialog" aria-expanded={open} aria-controls="system-panel" title="Přehled systému · pouze superadmin" onClick={() => { dialog.current?.showModal(); setOpen(true); }}><Activity size={21}/>{warning && <i aria-label="Stav vyžaduje kontrolu"/>}</button>
    <dialog id="system-panel" ref={dialog} className="system-panel" aria-labelledby="system-panel-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close(); } }}>
      <div className="system-panel-inner">
        <header className="system-panel-header"><div><small>SUPERADMIN</small><h2 id="system-panel-title">Přehled systému</h2></div><button autoFocus className="system-icon-button" type="button" aria-label="Zavřít přehled systému" onClick={() => dialog.current?.close()}><X size={20}/></button></header>
        <div className="system-panel-scroll" aria-busy={loading}>
          <div className="system-refresh"><small>{data ? `Aktualizováno ${time(data.asOf)}` : "Načítání statistik…"}</small><button className="system-icon-button" type="button" disabled={loading} aria-label="Obnovit statistiky" onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={16}/></button></div>
          {unavailable && <p role="status" className="system-warning">Obnovení se nezdařilo. {data ? "Zobrazen poslední známý stav." : "Statistiky nyní nejsou dostupné."}</p>}
          {data && <>
            <div className="system-kpis">
              <Metric label="Uživatelé" value={data.users} href="/uzivatele#seznam-uzivatelu"/>
              <Metric label="Online" value={data.online} href="/uzivatele?activity=online#seznam-uzivatelu"/>
              <Metric label="Domy" value={data.properties} href="/portfolio"/>
              <Metric label="Jednotky" value={data.units}/>
            </div>
            <p className="system-note">Online = aktivita v posledních 2 minutách. Počty uživatelů nezahrnují označené testovací účty.</p>
            <details open className="system-section"><summary>Uživatelé a portfolio</summary>
              <Row label="Aktivní uživatelé za 30 dní" value={number(data.activeUsers)}/>
              <Row label="Testovací účty zvlášť" value={number(data.testUsers)}/>
              <Row label="Čekající pozvánky" value={number(data.invitations)} href="/uzivatele#cekajici-pozvanky"/>
              <Row label="Archivované domy" value={number(data.archivedProperties)}/>
              <Row label="Neaktivní jednotky / archiv domů" value={number(data.inactiveUnits)}/>
              <p className="system-note">Domy a jednotky patří do této instalace včetně jejích demo dat. Jednotky nezahrnují neaktivní jednotky a archivované domy. Nejde o součet vlastníků ani skupin.</p>
            </details>
            <details open className="system-section"><summary>Stav systému</summary>
              <Row label="Databáze" value="Připojena"/>
              <Row label="Plánovač" value={{ ok: "Běh dokončen", unknown: "Bez záznamu", stale: "Více než 26 h bez běhu", failed: "Vyžaduje kontrolu" }[data.scheduler.state] || "Neznámý stav"}/>
              <p className="system-note">Poslední běh: {time(data.scheduler.lastRun)}. Hodnotíme evidované běhy, nikoliv dostupnost hostingu.</p>
              {data.scheduler.failedSteps.length > 0 && <p className="system-warning">Neúspěšné kroky: {data.scheduler.failedSteps.join(", ")}</p>}
              <Row label="Chybné bankovní zprávy" value={number(data.inboxErrors)} href="/platby/nesparovane"/>
              <Row label="Neodeslaná nájemní upozornění · 24 h" value={number(data.failedEmails)}/>
              <Row label="Data MF" value={data.imports.mf ? `Q${data.imports.mf.marketQuarter} ${data.imports.mf.marketYear}` : "Dosud nenačtena"}/>
              <Row label="Index ČSÚ" value={data.imports.csu ? `Q${data.imports.csu.marketQuarter} ${data.imports.csu.marketYear}` : "Dosud nenačten"}/>
              <Row label="Ceny ČSÚ · období" value={data.imports.average?.sourcePeriod ?? "Dosud nenačteny"}/>
              <p className="system-note">Období importů ukazuje uložená data; samo nepotvrzuje, že zdroj nevydal novější údaje.</p>
            </details>
            <details className="system-section"><summary>Soubory a databáze</summary>
              <Row label="Evidované soubory" value={number(data.files.count)} href="/dokumenty"/>
              <Row label="Velikost originálů" value={size(data.files.bytes)}/>
              <Row label="Vyřazené soubory v evidenci" value={`${number(data.files.deletedCount)} · ${size(data.files.deletedBytes)}`}/>
              <Row label="Velikost databáze" value={size(data.databaseSize)}/>
              <p className="system-note">Soubory počítáme jednou podle evidence originálů, bez náhledů a avatarů. Vyřazení z evidence neověřuje fyzické smazání. Nejde o skutečnou obsazenost disku. Měření hostingu a limity doplníme po výběru poskytovatele.</p>
            </details>
            <details className="system-section"><summary>Trendy · posledních 90 dní</summary>
              {!data.snapshotAvailable && <p className="system-warning">Historii se nepodařilo načíst nebo uložit.</p>}
              <Trend history={data.history} metric="users" label="Uživatelé"/>
              <Trend history={data.history} metric="activeUsers" label="Aktivní za 30 dní"/>
              <Trend history={data.history} metric="properties" label="Domy"/>
              <Trend history={data.history} metric="units" label="Jednotky"/>
              <p className="system-note">První měření každého dne (UTC). {data.history.length ? `Zobrazená historie od ${data.history[0].day}.` : "Historie zatím není k dispozici."} Dny bez měření nedoplňujeme. Sběr zajišťuje plánovač, případně otevření panelu.</p>
            </details>
          </>}
        </div>
        <footer className="system-panel-footer">Statistiky této instalace · pouze pro superadmina</footer>
      </div>
    </dialog>
  </>;
}
function Metric({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = <><span>{label}{href && <ArrowUpRight size={13}/>}</span><strong>{number(value)}</strong></>;
  return href ? <Link className="system-kpi" href={href}>{content}</Link> : <div className="system-kpi">{content}</div>;
}
function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <><span>{label}</span><b>{value}</b></>;
  return href ? <Link className="system-row" href={href}>{content}</Link> : <div className="system-row">{content}</div>;
}
