"use client";

import {useId, useState} from "react";
import {AlertCircle, CalendarDays, Check, ChevronDown, ChevronUp, Info} from "lucide-react";
import type {PortalPaymentTone} from "@/lib/tenant-portal-payment-state";
import {tenantPortalPaymentOverview} from "@/lib/tenant-portal-payment-overview";

export type PortalPaymentRow = {
  id: string; period: string; periodKey: string; amount: string; received: string; remaining: string;
  tone: PortalPaymentTone; future: boolean; state: string; due: string;
  allocations: {id: string; date: string; amount: string}[]; offset?: string;
};

export function PortalPaymentHistory({id, rows, currentPeriod}: {id: string; rows: PortalPaymentRow[]; currentPeriod: string}) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const tableId = useId();
  const {overdue, history, compact: overview} = tenantPortalPaymentOverview(rows, currentPeriod);
  const filtered = history.filter(row => filter === "paid" ? row.tone === "paid" : filter === "future" ? row.future && row.tone !== "paid" : true);
  const compact = filter === "all" ? overview : filtered.slice(0, 4);
  const shown = expanded ? filtered : compact;
  const hiddenCount = filtered.length - compact.length;

  function table(items: PortalPaymentRow[], tableIdentifier: string, caption: string) {
    return <div className="tp-table-wrap"><table id={tableIdentifier} className="portal-payment-history"><caption className="sr-only">{caption}</caption><thead><tr><th scope="col">Období</th><th scope="col">Předpis</th><th scope="col">Přijato</th><th scope="col">K úhradě</th><th scope="col">Stav / splatnost</th></tr></thead><tbody>{items.map(row => <tr key={row.id} className={`portal-${row.tone}${row.future ? " portal-future" : ""}`}><th scope="row"><strong>{row.period}</strong></th><td data-label="Předpis">{row.amount}</td><td data-label="Přijato"><strong className={row.allocations.length ? "tp-received" : ""}>{row.received}</strong>{row.allocations.map(allocation => <small className="tp-received" key={allocation.id}><Check size={12} aria-hidden="true"/> Připsáno {allocation.date} · {allocation.amount}</small>)}{row.offset && <small className="tp-offset">Zápočet {row.offset}</small>}</td><td data-label="K úhradě">{row.remaining}</td><td data-label="Stav"><span className={`tp-status tp-status-${row.tone}`}>{row.state}</span><small>Splatnost {row.due}</small></td></tr>)}</tbody></table></div>;
  }
  return <section className="tp-history tp-card" id={id} aria-labelledby={`${id}-title`}>
    <header className="tp-history-header"><div className="tp-heading"><span className="tp-icon tp-icon-blue"><CalendarDays size={25}/></span><div><h2 id={`${id}-title`}>Moje platby</h2><p>Přehled nájmů a přijatých úhrad</p></div></div><div className="tp-history-filters" role="group" aria-label="Zobrazit platby">{[{id:"all",label:"Přehled"},{id:"paid",label:"Uhrazené"},{id:"future",label:"Budoucí nájmy"}].map(option => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => {setFilter(option.id); setExpanded(false);}}>{option.label}</button>)}</div></header>
    {overdue.length > 0 && <section className="tp-history-overdue" aria-labelledby={`${id}-overdue-title`}><h3 id={`${id}-overdue-title`}><AlertCircle size={19} aria-hidden="true"/> Nájem po splatnosti <span>{overdue.length}</span></h3><p>Tyto předpisy ještě nejsou plně uhrazené.</p>{table(overdue, `${tableId}-overdue`, "Neuhrazené nájmy po splatnosti")}</section>}
    <div className="tp-history-main">{table(shown, tableId, "Nájemní předpisy, přijaté úhrady a zbývající částky")}</div>
    {!shown.length && <p className="tp-empty">{rows.length ? hiddenCount > 0 ? "Další období najdete v úplné historii." : "V tomto výběru zatím nejsou žádné další platby." : "Jakmile správce připraví první předpis, najdete ho tady."}</p>}
    <footer className="tp-history-footer">{hiddenCount > 0 && <button type="button" className="tp-text-button" aria-expanded={expanded} aria-controls={tableId} onClick={() => setExpanded(!expanded)}>{expanded ? <>Zobrazit méně <ChevronUp size={16}/></> : <>Zobrazit další období ({hiddenCount}) <ChevronDown size={16}/></>}</button>}<p><Info size={15} aria-hidden="true"/> Odeslaná platba se zobrazí po připsání a přiřazení. Zápočty uvádíme zvlášť.</p></footer>
  </section>;
}
