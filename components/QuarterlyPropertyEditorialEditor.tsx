"use client";

import { useState } from "react";
import type { TechnicalSection, ValuationRow } from "@/lib/reporting/editorial-schema";
import { moneyInput, parseCzkToCents } from "@/lib/forms";

const propertyStatuses = [["", "Nevyplněno"], ["STABILIZED", "Stabilizovaná"], ["RENOVATION", "Rekonstrukce"], ["DEVELOPMENT", "Development"], ["EXIT", "Exit / prodej"]] as const;
const technicalStatuses = [["", "Bez stavu"], ["OK", "V pořádku"], ["WATCH", "Sledovat"], ["ACTION", "Vyžaduje akci"], ["RISK", "Riziko"]] as const;
type LegacyValuationRow = Extract<ValuationRow, { label: string }>;
type UnitValuationDraft = { kind: "UNIT"; unitLabel: string; disposition: string | null; floor: string | null; areaM2: string; amountCzk: string };

function move<T>(rows: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

export function QuarterlyPropertyEditorialEditor({ action, propertyStatus, managementCommentary, initialTechnicalSections, initialValuationRows }: { action: string; propertyStatus: string | null; managementCommentary: string | null; initialTechnicalSections: TechnicalSection[]; initialValuationRows: ValuationRow[] }) {
  const [technicalSections, setTechnicalSections] = useState(initialTechnicalSections);
  const legacyValuationRows = initialValuationRows.filter((row): row is LegacyValuationRow => !("kind" in row));
  const [unitValuationRows, setUnitValuationRows] = useState<UnitValuationDraft[]>(initialValuationRows.filter((row) => "kind" in row).map((row) => ({ kind: "UNIT", unitLabel: row.unitLabel, disposition: row.disposition, floor: row.floor, areaM2: row.areaM2 == null ? "" : String(row.areaM2).replace(".", ","), amountCzk: moneyInput(row.amountCents) })));
  const totalCents = legacyValuationRows.reduce((total, row) => total + (typeof row.amountCents === "number" ? row.amountCents : 0), 0) + unitValuationRows.reduce((total, row) => { try { return total + parseCzkToCents(row.amountCzk); } catch { return total; } }, 0);
  return <form className="edit-form" action={action} method="post">
    <div className="form-grid">
      <label className="field"><span>Stav projektu *</span><select name="propertyStatus" defaultValue={propertyStatus || ""}>{propertyStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář managementu</span><textarea name="managementCommentary" defaultValue={managementCommentary || ""} maxLength={10000}/></label>
    </div>
    <input type="hidden" name="technicalSections" value={JSON.stringify(technicalSections)}/>
    <input type="hidden" name="valuationRows" value={JSON.stringify([...legacyValuationRows, ...unitValuationRows])}/>
    <div style={{ marginTop: 16 }}><h3>Technické oblasti</h3>{technicalSections.map((section, index) => <div className="rule-summary" key={index}><div className="form-grid" style={{ flex: 1 }}>
      <label className="field"><span>Název</span><input value={section.title} maxLength={120} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))}/></label>
      <label className="field"><span>Stav</span><select value={section.status || ""} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.value ? event.target.value as TechnicalSection["status"] : undefined } : row))}>{technicalStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář</span><textarea value={section.commentary} maxLength={4000} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, commentary: event.target.value } : row))}/></label>
      <div className="form-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => setTechnicalSections((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" disabled={index === technicalSections.length - 1} onClick={() => setTechnicalSections((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setTechnicalSections((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div>
    </div></div>)}<button type="button" className="secondary" disabled={technicalSections.length >= 25} onClick={() => setTechnicalSections((rows) => [...rows, { title: "", commentary: "" }])}>Přidat technickou oblast</button></div>
    <div style={{ marginTop: 16 }}><h3>Ocenění jednotek</h3>
      {unitValuationRows.map((row, index) => <div className="rule-summary" key={index}><div className="form-grid" style={{ flex: 1 }}>
        <label className="field"><span>BJ *</span><input value={row.unitLabel} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unitLabel: event.target.value } : item))}/></label>
        <label className="field"><span>Dispozice</span><input value={row.disposition || ""} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, disposition: event.target.value } : item))}/></label>
        <label className="field"><span>Podlaží</span><input value={row.floor || ""} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, floor: event.target.value } : item))}/></label>
        <label className="field"><span>Plocha m²</span><input type="text" inputMode="decimal" value={row.areaM2} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, areaM2: event.target.value } : item))}/></label>
        <label className="field"><span>Ocenění (Kč) *</span><input type="text" inputMode="decimal" value={row.amountCzk} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, amountCzk: event.target.value } : item))}/></label>
        <div className="form-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => setUnitValuationRows((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" disabled={index === unitValuationRows.length - 1} onClick={() => setUnitValuationRows((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setUnitValuationRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div>
      </div></div>)}
      <button type="button" className="secondary" disabled={legacyValuationRows.length + unitValuationRows.length >= 40} onClick={() => setUnitValuationRows((rows) => [...rows, { kind: "UNIT", unitLabel: "", disposition: null, floor: null, areaM2: "", amountCzk: "" }])}>Přidat řádek ocenění</button>
      {legacyValuationRows.length > 0 && <div style={{ marginTop: 16 }}><h4>Starší formát ocenění</h4><p className="muted-copy">Tyto zmrazené řádky zůstávají beze změny kvůli kompatibilitě.</p>{legacyValuationRows.map((row, index) => <div className="rule-summary" key={index}><div><strong>{row.label}</strong><small>{row.amountCents != null ? `${moneyInput(row.amountCents)} Kč` : row.valueLabel}</small>{row.note && <small>{row.note}</small>}</div></div>)}</div>}
      <p><strong>Celkové ocenění: {(totalCents / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</strong></p>
    </div>
    <div className="form-actions"><button className="primary" type="submit">Uložit obsah nemovitosti</button></div>
  </form>;
}
