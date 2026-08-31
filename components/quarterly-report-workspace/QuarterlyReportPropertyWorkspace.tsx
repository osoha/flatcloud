import Link from "next/link";
import { QuarterlyPropertyEditorialEditor } from "@/components/QuarterlyPropertyEditorialEditor";
import { valuationTotalCents, type TechnicalSection, type ValuationRow } from "@/lib/reporting/editorial-schema";
import { QuarterlyReportDataPanel } from "./QuarterlyReportDataPanel";
import { QuarterlyReportPrimaryPhoto } from "./QuarterlyReportPrimaryPhoto";
import type { QuarterlyPropertyPhotoCandidate, QuarterlyPropertyWorkspaceData, QuarterlySnapshotCandidate } from "./types";

const propertyStatusLabels: Record<string, string> = { STABILIZED: "Stabilizovaná", RENOVATION: "Rekonstrukce", DEVELOPMENT: "Development", EXIT: "Exit / prodej" };
const technicalStatusLabels: Record<string, string> = { OK: "V pořádku", WATCH: "Sledovat", ACTION: "Vyžaduje akci", RISK: "Riziko" };
const dash = "—";
const integer = (value: number | null | undefined) => value == null ? dash : value.toLocaleString("cs-CZ");
const money = (value: number | null | undefined) => value == null ? dash : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const percent = (value: number | null | undefined) => value == null ? dash : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

function OperationalKpiPreview({ property }: { property: QuarterlyPropertyWorkspaceData }) {
  const data = property.snapshot.data;
  if (!data) return <section className="quarterly-editor-section"><h3>Provozní KPI</h3><p className="muted-copy">Data vybraného snapshotu se nepodařilo načíst.</p></section>;
  const units = data.units, rent = data.rentRoll, collections = data.collections, deposits = data.deposits, leases = data.leases;
  return <section className="quarterly-editor-section"><div className="quarterly-section-heading"><div><span className="quarterly-eyebrow">Pouze pro kontext editora</span><h3>Provozní KPI vybraného snapshotu</h3></div><small>Bez nových výpočtů</small></div><div className="quarterly-kpi-grid">
    <div><span>Jednotky celkem</span><strong>{integer(units?.total)}</strong><small>Pronajímatelné {integer(units?.rentable)}</small></div>
    <div><span>Obsazené / volné</span><strong>{integer(units?.occupied)} / {integer(units?.vacant)}</strong><small>Rekonstrukce {integer(units?.renovation)}</small></div>
    <div><span>Měsíční nájemné</span><strong>{money(rent?.monthlyNetRentCents)}</strong><small>Se službami {money(rent?.monthlyTotalCents)}</small></div>
    <div><span>Inkaso kvartálu</span><strong>{percent(collections?.collectionRateBps)}</strong><small>{money(collections?.quarterPaidCents)} z {money(collections?.quarterExpectedCents)}</small></div>
    <div><span>Dluh po splatnosti</span><strong>{money(collections?.overdueDebtCents)}</strong><small>Stav k rozhodnému datu</small></div>
    <div><span>Držené / chybějící kauce</span><strong>{money(deposits?.heldPrincipalCents)}</strong><small>Chybí {money(deposits?.missingCents)}</small></div>
    <div><span>Aktivní smlouvy</span><strong>{integer(leases?.active)}</strong><small>Končí do 90 dnů {integer(leases?.expiring90Days)}</small></div>
    <div><span>Budoucí smlouvy</span><strong>{integer(leases?.future)}</strong><small>Ukončené YTD {integer(leases?.endedYtd)}</small></div>
  </div></section>;
}

function PropertyEditorialReadOnly({ property }: { property: QuarterlyPropertyWorkspaceData }) {
  const technicalSections = property.technicalSections;
  const valuationRows = property.valuationRows;
  const unitRows = valuationRows?.filter((row) => "kind" in row) ?? [];
  const legacyRows = valuationRows?.filter((row) => !("kind" in row)) ?? [];
  return <div className="quarterly-readonly-editor"><section className="quarterly-editor-section"><h3>Stav projektu</h3><p><strong>{property.propertyStatus ? propertyStatusLabels[property.propertyStatus] : "Nevyplněno"}</strong></p><h3>Komentář managementu</h3><p className="muted-copy pre-wrap">{property.managementCommentary || "Bez komentáře"}</p></section><OperationalKpiPreview property={property}/><section className="quarterly-editor-section"><h3>Technické oblasti</h3>{technicalSections === null ? <p className="muted-copy">Technické oblasti se nepodařilo načíst.</p> : technicalSections.length ? technicalSections.map((section: TechnicalSection, index) => <div className="rule-summary" key={index}><div><strong>{section.title}</strong><small>{section.status ? technicalStatusLabels[section.status] : "Bez stavu"}</small><small className="pre-wrap">{section.commentary || "Bez komentáře"}</small></div></div>) : <p className="muted-copy">Bez technických oblastí</p>}</section><section className="quarterly-editor-section"><h3>Ocenění</h3>{valuationRows === null ? <p className="muted-copy">Řádky ocenění se nepodařilo načíst.</p> : valuationRows.length ? <>{unitRows.length > 0 && <div className="table-wrap"><table><thead><tr><th>BJ</th><th>Dispozice</th><th>Podlaží</th><th>m²</th><th>Ocenění</th></tr></thead><tbody>{unitRows.map((row, index) => "kind" in row && <tr key={index}><td>{row.unitLabel}</td><td>{row.disposition || dash}</td><td>{row.floor || dash}</td><td>{row.areaM2 == null ? dash : row.areaM2.toLocaleString("cs-CZ")}</td><td>{money(row.amountCents)}</td></tr>)}</tbody></table></div>}{legacyRows.length > 0 && <><h4>Starší formát ocenění</h4>{legacyRows.map((row: ValuationRow, index) => !("kind" in row) && <div className="rule-summary" key={index}><div><strong>{row.label}</strong><small>{row.amountCents != null ? money(row.amountCents) : row.valueLabel}</small>{row.note && <small>{row.note}</small>}</div></div>)}</>}<p><strong>Celkové ocenění: {money(valuationTotalCents(valuationRows))}</strong></p></> : <p className="muted-copy">Bez řádků ocenění</p>}</section></div>;
}

export function QuarterlyReportPropertyWorkspace({ property, candidates, photoCandidates, editable, baseAction, previous, next }: { property: QuarterlyPropertyWorkspaceData; candidates: QuarterlySnapshotCandidate[]; photoCandidates: QuarterlyPropertyPhotoCandidate[]; editable: boolean; baseAction: string; previous?: { id: string; name: string }; next?: { id: string; name: string } }) {
  const technicalSections = property.technicalSections || [];
  const valuationRows = property.valuationRows || [];
  return <div className="quarterly-workspace-content"><div className="card quarterly-property-identity"><span className="quarterly-eyebrow">Kvartální report nemovitosti</span><div className="quarterly-property-heading"><div><h2>{property.propertyName}</h2><p>{property.propertyAddress}</p></div><span className="status">{property.propertyStatus ? propertyStatusLabels[property.propertyStatus] : "Stav nevyplněn"}</span></div></div>
    <QuarterlyReportPrimaryPhoto selected={property.primaryPhoto} candidates={photoCandidates} editable={editable} baseAction={baseAction}/>
    <div className="card quarterly-property-main">{editable ? <QuarterlyPropertyEditorialEditor action={`${baseAction}/content`} propertyStatus={property.propertyStatus} managementCommentary={property.managementCommentary} initialTechnicalSections={technicalSections} initialValuationRows={valuationRows} operationalKpis={<OperationalKpiPreview property={property}/>}/> : <PropertyEditorialReadOnly property={property}/>}</div>
    <div className="card quarterly-preview-placeholder"><div><span className="quarterly-eyebrow">Budoucí výstup pro tuto nemovitost</span><h2>Náhled reportu</h2><p>Vizuální náhled samostatného kvartálního reportu bude doplněn v dalších designových fázích. Budoucí cílový formát je A4 na šířku, primárně pro obrazovku a vždy pro jednu nemovitost.</p></div><button className="secondary" disabled>Náhled zatím není dostupný</button></div>
    <QuarterlyReportDataPanel snapshot={property.snapshot} candidates={candidates} editable={editable} baseAction={baseAction}/>
    <nav className="quarterly-property-pager" aria-label="Přechod mezi nemovitostmi">{previous ? <Link className="button secondary" href={`?propertyId=${encodeURIComponent(previous.id)}`}>← {previous.name}</Link> : <span/>}{next ? <Link className="button secondary" href={`?propertyId=${encodeURIComponent(next.id)}`}>{next.name} →</Link> : <span/>}</nav>
  </div>;
}
