"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState, type KeyboardEvent, type MouseEvent } from "react";
import { money } from "@/lib/format";
import { unitDispositions } from "@/lib/labels";
import { mfRentCategoryLabels, type MfRentCategoryKey } from "@/lib/reporting/mf-rent/live-benchmark";

type PropertyRow = {
  propertyId: string;
  propertyName: string;
  territoryName: string | null;
  comparableUnits: number;
  coveredUnits: number;
  coverageBps: number | null;
  actualRentPerM2Cents: number | null;
  marketRentPerM2Cents: number | null;
  rentToMarketBps: number | null;
  reversionaryPotentialCents: number;
};

type UnitRow = {
  leaseId: string | null;
  propertyId: string;
  unitId: string;
  unitLabel: string;
  occupancyStatus: "OCCUPIED" | "VACANT";
  disposition: string | null;
  category: MfRentCategoryKey | null;
  areaM2: number;
  actualRentPerM2Cents: number | null;
  marketRentPerM2Cents: number | null;
  marketGapPerM2Cents: number | null;
  rentToMarketBps: number | null;
  reversionaryPotentialCents: number | null;
  coverageStatus: "COVERED" | "MISSING_DISPOSITION" | "MISSING_TERRITORY" | "MISSING_REFERENCE" | "MISSING_ACTUAL";
};

const pct = (value: number | null) => value === null ? "—" : `${(value / 100).toFixed(1)} %`;
const area = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} m²`;
const amount = (value: number | null) => value === null ? "—" : money(value);

function benchmarkCategory(unit: UnitRow) {
  if (unit.category) return mfRentCategoryLabels[unit.category];
  if (unit.coverageStatus === "MISSING_DISPOSITION") return <Link className="table-link" href={`/nemovitosti/${unit.propertyId}/jednotky/${unit.unitId}/upravit`}>Doplnit dispozici →</Link>;
  if (unit.coverageStatus === "MISSING_TERRITORY") return <Link className="table-link" href={`/nemovitosti/${unit.propertyId}/reporting`}>Doplnit území MF →</Link>;
  return "Referenční hodnota nedostupná";
}

export function MfBenchmarkTable({ properties, units }: { properties: PropertyRow[]; units: UnitRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(propertyId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }
  function onClick(event: MouseEvent<HTMLTableRowElement>, propertyId: string) {
    if (event.target instanceof Element && event.target.closest("a,button")) return;
    toggle(propertyId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>, propertyId: string) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle(propertyId);
  }
  return <div className="card portfolio-table-card report-table-card mf-benchmark-table"><div className="table-toolbar"><h2>MF benchmark podle nemovitostí</h2></div><div className="table-wrap"><table><thead><tr>{["Nemovitost", "Území MF", "Pokryté jednotky", "Pokrytí plochy", "Skutečnost Kč/m²", "MF Kč/m²", "Nájem / trh", "Potenciál / měsíc"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{properties.length ? properties.map((property) => {
    const isExpanded = expanded.has(property.propertyId);
    const propertyUnits = units.filter((unit) => unit.propertyId === property.propertyId);
    const detailsId = `mf-property-${property.propertyId}`;
    return <Fragment key={property.propertyId}><tr className="mf-property-toggle" role="button" tabIndex={0} aria-expanded={isExpanded} aria-controls={detailsId} aria-label={`${isExpanded ? "Sbalit" : "Rozbalit"} MF benchmark: ${property.propertyName}`} onClick={(event) => onClick(event, property.propertyId)} onKeyDown={(event) => onKeyDown(event, property.propertyId)}><td><button type="button" className="mf-property-toggle-button" onClick={() => toggle(property.propertyId)} aria-expanded={isExpanded} aria-controls={detailsId}>{isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<strong>{property.propertyName}</strong></button></td><td>{property.territoryName || "Nepřiřazeno"}</td><td>{property.coveredUnits} / {property.comparableUnits}</td><td>{pct(property.coverageBps)}</td><td>{property.actualRentPerM2Cents === null ? "—" : money(property.actualRentPerM2Cents)}</td><td>{property.marketRentPerM2Cents === null ? "—" : money(property.marketRentPerM2Cents)}</td><td>{pct(property.rentToMarketBps)}</td><td>{property.coveredUnits ? money(property.reversionaryPotentialCents) : "—"}</td></tr>{isExpanded && <tr id={detailsId} className="mf-unit-drilldown-row"><td colSpan={8}><div className="mf-unit-drilldown">{propertyUnits.length ? <div className="table-wrap"><table><thead><tr>{["Jednotka", "Stav", "Dispozice", "Kategorie MF", "Plocha", "Skutečnost Kč/m²", "MF Kč/m²", "Rozdíl Kč/m²", "Nájem / trh", "Potenciál / měsíc"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{propertyUnits.map((unit) => <tr className={unit.coverageStatus === "COVERED" ? "" : "mf-unit-incomplete"} key={unit.unitId}><td><Link className="table-link" href={`/nemovitosti/${unit.propertyId}/jednotky/${unit.unitId}`}>{unit.unitLabel}</Link></td><td><span className={`status ${unit.occupancyStatus === "VACANT" ? "warn" : "ok"}`}>{unit.occupancyStatus === "VACANT" ? "Volná" : "Obsazená"}</span></td><td>{unit.disposition ? unitDispositions[unit.disposition] || unit.disposition : "—"}</td><td>{benchmarkCategory(unit)}</td><td>{area(unit.areaM2)}</td><td>{amount(unit.actualRentPerM2Cents)}</td><td>{amount(unit.marketRentPerM2Cents)}</td><td>{amount(unit.marketGapPerM2Cents)}</td><td>{pct(unit.rentToMarketBps)}</td><td>{amount(unit.reversionaryPotentialCents)}</td></tr>)}</tbody></table></div> : <div className="mf-unit-empty"><p>Pro tuto nemovitost zatím není žádná standardní bytová jednotka s evidovanou plochou.</p><span>Chybějící vstupy najdete v Datové konzistenci na kartě Přehled.</span><Link className="table-link" href={`/nemovitosti/${property.propertyId}/reporting`}>Otevřít nastavení MF →</Link></div>}</div></td></tr>}</Fragment>;
  }) : <tr><td colSpan={8} className="table-empty">Bez záznamů</td></tr>}</tbody></table></div></div>;
}
