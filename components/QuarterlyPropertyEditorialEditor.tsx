"use client";

import { useState } from "react";
import type { TechnicalSection, ValuationRow } from "@/lib/reporting/editorial-schema";

const propertyStatuses = [["", "Nevyplněno"], ["STABILIZED", "Stabilizovaná"], ["RENOVATION", "Rekonstrukce"], ["DEVELOPMENT", "Development"], ["EXIT", "Exit / prodej"]] as const;
const technicalStatuses = [["", "Bez stavu"], ["OK", "V pořádku"], ["WATCH", "Sledovat"], ["ACTION", "Vyžaduje akci"], ["RISK", "Riziko"]] as const;
type ValuationDraft = Omit<ValuationRow, "amountCents"> & { amountCents: string };

function move<T>(rows: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

export function QuarterlyPropertyEditorialEditor({ action, propertyStatus, managementCommentary, initialTechnicalSections, initialValuationRows }: { action: string; propertyStatus: string | null; managementCommentary: string | null; initialTechnicalSections: TechnicalSection[]; initialValuationRows: ValuationRow[] }) {
  const [technicalSections, setTechnicalSections] = useState(initialTechnicalSections);
  const [valuationRows, setValuationRows] = useState<ValuationDraft[]>(initialValuationRows.map((row) => ({ ...row, amountCents: row.amountCents == null ? "" : String(row.amountCents) })));
  const serializedValuations = valuationRows.map((row) => ({ ...row, amountCents: row.amountCents.trim() === "" ? null : Number(row.amountCents) }));
  return <form className="edit-form" action={action} method="post">
    <div className="form-grid">
      <label className="field"><span>Stav projektu *</span><select name="propertyStatus" defaultValue={propertyStatus || ""}>{propertyStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář managementu</span><textarea name="managementCommentary" defaultValue={managementCommentary || ""} maxLength={10000}/></label>
    </div>
    <input type="hidden" name="technicalSections" value={JSON.stringify(technicalSections)}/>
    <input type="hidden" name="valuationRows" value={JSON.stringify(serializedValuations)}/>
    <div style={{ marginTop: 16 }}><h3>Technické oblasti</h3>{technicalSections.map((section, index) => <div className="rule-summary" key={index}><div className="form-grid" style={{ flex: 1 }}>
      <label className="field"><span>Název</span><input value={section.title} maxLength={120} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))}/></label>
      <label className="field"><span>Stav</span><select value={section.status || ""} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.value ? event.target.value as TechnicalSection["status"] : undefined } : row))}>{technicalStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář</span><textarea value={section.commentary} maxLength={4000} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, commentary: event.target.value } : row))}/></label>
      <div className="form-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => setTechnicalSections((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" disabled={index === technicalSections.length - 1} onClick={() => setTechnicalSections((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setTechnicalSections((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div>
    </div></div>)}<button type="button" className="secondary" disabled={technicalSections.length >= 25} onClick={() => setTechnicalSections((rows) => [...rows, { title: "", commentary: "" }])}>Přidat technickou oblast</button></div>
    <div style={{ marginTop: 16 }}><h3>Ocenění</h3>{valuationRows.map((row, index) => <div className="rule-summary" key={index}><div className="form-grid" style={{ flex: 1 }}>
      <label className="field"><span>Řádek</span><input value={row.label} maxLength={120} onChange={(event) => setValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, label: event.target.value } : item))}/></label>
      <label className="field"><span>Částka v haléřích</span><input type="number" step="1" value={row.amountCents} onChange={(event) => setValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, amountCents: event.target.value } : item))}/></label>
      <label className="field"><span>Textová hodnota</span><input value={row.valueLabel || ""} maxLength={120} onChange={(event) => setValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, valueLabel: event.target.value } : item))}/></label>
      <label className="field"><span>Poznámka</span><input value={row.note || ""} maxLength={500} onChange={(event) => setValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, note: event.target.value } : item))}/></label>
      <div className="form-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => setValuationRows((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" disabled={index === valuationRows.length - 1} onClick={() => setValuationRows((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setValuationRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div>
    </div></div>)}<button type="button" className="secondary" disabled={valuationRows.length >= 40} onClick={() => setValuationRows((rows) => [...rows, { label: "", amountCents: "", valueLabel: null, note: null }])}>Přidat řádek ocenění</button></div>
    <div className="form-actions"><button className="primary" type="submit">Uložit obsah nemovitosti</button></div>
  </form>;
}
