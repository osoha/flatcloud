"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

export function QuarterlyPropertyEditorialEditor({ action, propertyStatus, managementCommentary, additionalCommentary, initialTechnicalSections, initialValuationRows, operationalKpis }: { action: string; propertyStatus: string | null; managementCommentary: string | null; additionalCommentary: string | null; initialTechnicalSections: TechnicalSection[]; initialValuationRows: ValuationRow[]; operationalKpis?: ReactNode }) {
  const [technicalSections, setTechnicalSections] = useState(initialTechnicalSections);
  const legacyValuationRows = initialValuationRows.filter((row): row is LegacyValuationRow => !("kind" in row));
  const initialUnitValuationRows = useMemo<UnitValuationDraft[]>(() => initialValuationRows.filter((row) => "kind" in row).map((row) => ({ kind: "UNIT", unitLabel: row.unitLabel, disposition: row.disposition, floor: row.floor, areaM2: row.areaM2 == null ? "" : String(row.areaM2).replace(".", ","), amountCzk: moneyInput(row.amountCents) })), [initialValuationRows]);
  const [unitValuationRows, setUnitValuationRows] = useState<UnitValuationDraft[]>(initialUnitValuationRows);
  const submitting = useRef(false);
  const dirty = JSON.stringify(technicalSections) !== JSON.stringify(initialTechnicalSections) || JSON.stringify(unitValuationRows) !== JSON.stringify(initialUnitValuationRows);
  useEffect(() => {
    document.documentElement.dataset.quarterlyEditorialDirty = dirty ? "true" : "false";
    const externalSubmit = () => { submitting.current = true; };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || submitting.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const protectWorkspaceNavigation = (event: MouseEvent) => {
      if (!dirty || submitting.current || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      if (!window.confirm("Máte neuložené změny technických oblastí nebo ocenění. Opravdu chcete odejít?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("quarterly-report-external-submit", externalSubmit);
    document.addEventListener("click", protectWorkspaceNavigation, true);
    return () => {
      delete document.documentElement.dataset.quarterlyEditorialDirty;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("quarterly-report-external-submit", externalSubmit);
      document.removeEventListener("click", protectWorkspaceNavigation, true);
    };
  }, [dirty]);
  const totalCents = legacyValuationRows.reduce((total, row) => total + (typeof row.amountCents === "number" ? row.amountCents : 0), 0) + unitValuationRows.reduce((total, row) => { try { return total + parseCzkToCents(row.amountCzk); } catch { return total; } }, 0);
  return <form className="edit-form quarterly-property-editor" action={action} method="post" onSubmit={() => { submitting.current = true; }}>
    <div className="form-grid">
      <label className="field"><span>Stav projektu *</span><select name="propertyStatus" defaultValue={propertyStatus || ""}>{propertyStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář managementu</span><textarea name="managementCommentary" defaultValue={managementCommentary || ""} maxLength={10000}/></label>
    </div>
    {operationalKpis}
    <input type="hidden" name="technicalSections" value={JSON.stringify(technicalSections)}/>
    <input type="hidden" name="valuationRows" value={JSON.stringify([...legacyValuationRows, ...unitValuationRows])}/>
    <div style={{ marginTop: 16 }}><h3>Technické oblasti</h3>{technicalSections.map((section, index) => <div className="rule-summary" key={index}><div className="form-grid" style={{ flex: 1 }}>
      <label className="field"><span>Název</span><input value={section.title} maxLength={120} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))}/></label>
      <label className="field"><span>Stav</span><select value={section.status || ""} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.value ? event.target.value as TechnicalSection["status"] : undefined } : row))}>{technicalStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field field-full"><span>Komentář</span><textarea value={section.commentary} maxLength={4000} onChange={(event) => setTechnicalSections((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, commentary: event.target.value } : row))}/></label>
      <div className="form-actions"><button type="button" className="secondary" disabled={index === 0} onClick={() => setTechnicalSections((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" disabled={index === technicalSections.length - 1} onClick={() => setTechnicalSections((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setTechnicalSections((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div>
    </div></div>)}<button type="button" className="secondary" disabled={technicalSections.length >= 25} onClick={() => setTechnicalSections((rows) => [...rows, { title: "", commentary: "" }])}>Přidat technickou oblast</button></div>
    <div style={{ marginTop: 16 }}><h3>Ocenění jednotek</h3>
      {unitValuationRows.length > 0 && <div className="quarterly-valuation-table-wrap"><table className="quarterly-valuation-table"><thead><tr><th>BJ *</th><th>Dispozice</th><th>Podlaží</th><th>Plocha m²</th><th>Ocenění (Kč) *</th><th>Pořadí a akce</th></tr></thead><tbody>{unitValuationRows.map((row, index) => <tr key={index}>
        <td><input aria-label={`BJ ${index + 1}`} value={row.unitLabel} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unitLabel: event.target.value } : item))}/></td>
        <td><input aria-label={`Dispozice ${index + 1}`} value={row.disposition || ""} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, disposition: event.target.value } : item))}/></td>
        <td><input aria-label={`Podlaží ${index + 1}`} value={row.floor || ""} maxLength={120} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, floor: event.target.value } : item))}/></td>
        <td><input aria-label={`Plocha ${index + 1}`} type="text" inputMode="decimal" value={row.areaM2} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, areaM2: event.target.value } : item))}/></td>
        <td><input aria-label={`Ocenění ${index + 1}`} type="text" inputMode="decimal" value={row.amountCzk} onChange={(event) => setUnitValuationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, amountCzk: event.target.value } : item))}/></td>
        <td><div className="quarterly-row-actions"><button type="button" className="secondary" aria-label="Posunout nahoru" disabled={index === 0} onClick={() => setUnitValuationRows((rows) => move(rows, index, -1))}>↑</button><button type="button" className="secondary" aria-label="Posunout dolů" disabled={index === unitValuationRows.length - 1} onClick={() => setUnitValuationRows((rows) => move(rows, index, 1))}>↓</button><button type="button" className="danger-button" onClick={() => setUnitValuationRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Odebrat</button></div></td>
      </tr>)}</tbody></table></div>}
      <button type="button" className="secondary" disabled={legacyValuationRows.length + unitValuationRows.length >= 40} onClick={() => setUnitValuationRows((rows) => [...rows, { kind: "UNIT", unitLabel: "", disposition: null, floor: null, areaM2: "", amountCzk: "" }])}>Přidat řádek ocenění</button>
      {legacyValuationRows.length > 0 && <div style={{ marginTop: 16 }}><h4>Starší formát ocenění</h4><p className="muted-copy">Tyto zmrazené řádky zůstávají beze změny kvůli kompatibilitě.</p>{legacyValuationRows.map((row, index) => <div className="rule-summary" key={index}><div><strong>{row.label}</strong><small>{row.amountCents != null ? `${moneyInput(row.amountCents)} Kč` : row.valueLabel}</small>{row.note && <small>{row.note}</small>}</div></div>)}</div>}
      <p><strong>Celkové ocenění: {(totalCents / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč</strong></p>
    </div>
    <section className="quarterly-editor-section quarterly-additional-commentary-editor"><h3>Doplňující komentář</h3><p className="muted-copy">Volitelný prostor pro podrobnější vysvětlení, které se nevejde do ostatních částí reportu. Pokud zůstane prázdný, stránka se do reportu nevloží.</p><label className="field field-full"><span>Doplňující komentář</span><textarea name="additionalCommentary" defaultValue={additionalCommentary || ""} maxLength={10000}/></label></section>
    <div className="form-actions"><span className={`quarterly-save-state ${dirty ? "dirty" : ""}`}>{dirty ? "Neuložené změny" : "Změny jsou uložené"}</span><button className="primary" type="submit">Uložit obsah nemovitosti</button></div>
  </form>;
}
