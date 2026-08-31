import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { FrozenQuarterlyReportPdfData, FrozenQuarterlyReportPdfProperty } from "./quarterly-report-pdf-data";
import { REPORT_PDF_RENDERER_VERSION } from "./constants";
import { aggregateKnownReportValues, type ReportPdfNumeric } from "./aggregation";
import { REPORT_PDF_FONT_PATH, REPORT_PDF_LOGO_PATH } from "./assets";

export { REPORT_PDF_RENDERER_VERSION } from "./constants";
const FONT_FAMILY = "FlatCloudNotoSans";
Font.register({ family: FONT_FAMILY, src: REPORT_PDF_FONT_PATH });

const colors = { ink: "#172033", muted: "#667085", blue: "#2667ff", pale: "#eef3ff", line: "#d9e1ef", green: "#157f62", amber: "#a15c00", red: "#b42318", white: "#ffffff" };
const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 9, color: colors.ink, paddingTop: 44, paddingHorizontal: 42, paddingBottom: 46, lineHeight: 1.45 },
  cover: { paddingTop: 70, justifyContent: "space-between" }, logo: { width: 138, height: 40, objectFit: "contain", objectPosition: "left" },
  coverTitle: { fontSize: 30, marginTop: 90, color: colors.ink }, coverGroup: { fontSize: 18, marginTop: 14 }, coverPeriod: { fontSize: 13, color: colors.blue, marginTop: 8 },
  coverMeta: { color: colors.muted, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  h1: { fontSize: 20, marginBottom: 14 }, h2: { fontSize: 13, marginTop: 14, marginBottom: 7, color: colors.ink }, h3: { fontSize: 10, marginBottom: 4 },
  body: { fontSize: 9, color: colors.ink }, muted: { color: colors.muted }, section: { marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, metric: { width: "31.8%", padding: 9, backgroundColor: colors.pale, borderRadius: 3 }, metricLabel: { fontSize: 7, color: colors.muted, marginBottom: 3 }, metricValue: { fontSize: 12 },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: 3 }, row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 23, alignItems: "center" }, lastRow: { borderBottomWidth: 0 }, cellLabel: { width: "62%", padding: 6, color: colors.muted }, cellValue: { width: "38%", padding: 6, textAlign: "right" },
  valuationCell: { padding: 5, width: "17%" }, valuationUnit: { padding: 5, width: "18%" }, valuationArea: { padding: 5, width: "15%", textAlign: "right" }, valuationAmount: { padding: 5, width: "33%", textAlign: "right" }, valuationHeader: { backgroundColor: colors.pale, color: colors.muted },
  badge: { alignSelf: "flex-start", backgroundColor: colors.pale, color: colors.blue, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, marginTop: 4 },
  note: { padding: 9, borderLeftWidth: 3, borderLeftColor: colors.blue, backgroundColor: "#f8faff", marginBottom: 6 },
  technical: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }, status: { fontSize: 7, color: colors.muted, marginBottom: 2 },
  propertyHeader: { borderBottomWidth: 2, borderBottomColor: colors.blue, paddingBottom: 10, marginBottom: 12 }, propertyAddress: { color: colors.muted, marginTop: 3 },
  quality: { padding: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 3, marginBottom: 6 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 20, flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 },
  provenance: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, color: colors.muted, fontSize: 7 },
});

type Numeric = ReportPdfNumeric;
const dash = "—";
const integer = (value: Numeric) => value == null ? dash : value.toLocaleString("cs-CZ");
const decimal = (value: Numeric, suffix = "") => value == null ? dash : `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}${suffix}`;
const money = (value: Numeric) => value == null ? dash : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const percentBps = (value: Numeric) => value == null ? dash : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
const sourceLabel = (source: string) => source === "CALCULATED" ? "Automaticky vypočtený snapshot" : "Ruční historický baseline";
const propertyStatusLabels = { STABILIZED: "Stabilizovaná", RENOVATION: "Rekonstrukce", DEVELOPMENT: "Development", EXIT: "Exit / prodej" } as const;
const technicalStatusLabels = { OK: "V pořádku", WATCH: "Sledovat", ACTION: "Vyžaduje akci", RISK: "Riziko" } as const;
const reportDate = (value: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
type SnapshotSection = "units" | "rentRoll" | "collections" | "deposits" | "leases";
function section<K extends SnapshotSection>(property: FrozenQuarterlyReportPdfProperty, key: K): NonNullable<FrozenQuarterlyReportPdfProperty["snapshot"]["data"][K]> { return (property.snapshot.data[key] ?? {}) as NonNullable<FrozenQuarterlyReportPdfProperty["snapshot"]["data"][K]>; }

function Footer({ data }: { data: FrozenQuarterlyReportPdfData }) { return <View style={styles.footer} fixed><Text>FlatCloud · Q{data.quarter} {data.year} · revize {data.revision}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function TableRows({ rows }: { rows: Array<[string, string]> }) { return <View style={styles.table}>{rows.map(([label, value], index) => <View style={[styles.row, index === rows.length - 1 ? styles.lastRow : {}]} key={label}><Text style={styles.cellLabel}>{label}</Text><Text style={styles.cellValue}>{value}</Text></View>)}</View>; }
const valuationTotalCents = (rows: FrozenQuarterlyReportPdfProperty["valuationRows"]) => rows.reduce((total, row) => total + (typeof row.amountCents === "number" ? row.amountCents : 0), 0);

function ValuationTable({ property }: { property: FrozenQuarterlyReportPdfProperty }) {
  const unitRows = property.valuationRows.filter((row) => "kind" in row);
  const legacyRows = property.valuationRows.filter((row) => !("kind" in row));
  return <View><Text style={styles.h2}>Ocenění</Text>{unitRows.length > 0 && <View style={styles.table}>
    <View style={[styles.row, styles.valuationHeader]}><Text style={styles.valuationUnit}>BJ</Text><Text style={styles.valuationCell}>Dispozice</Text><Text style={styles.valuationCell}>Podlaží</Text><Text style={styles.valuationArea}>m²</Text><Text style={styles.valuationAmount}>Ocenění</Text></View>
    {unitRows.map((row, index) => "kind" in row && <View style={styles.row} key={`${row.unitLabel}-${index}`}><Text style={styles.valuationUnit}>{row.unitLabel}</Text><Text style={styles.valuationCell}>{row.disposition || dash}</Text><Text style={styles.valuationCell}>{row.floor || dash}</Text><Text style={styles.valuationArea}>{decimal(row.areaM2)}</Text><Text style={styles.valuationAmount}>{money(row.amountCents)}</Text></View>)}
  </View>}{legacyRows.length > 0 && <View><Text style={styles.h3}>Starší formát ocenění</Text><TableRows rows={legacyRows.map((row) => !("kind" in row) ? [row.label, `${row.amountCents != null ? money(row.amountCents) : row.valueLabel || dash}${row.note ? ` · ${row.note}` : ""}`] : [dash, dash])}/></View>}<TableRows rows={[["Celkem", money(valuationTotalCents(property.valuationRows))]]}/></View>;
}

function PortfolioSummary({ data }: { data: FrozenQuarterlyReportPdfData }) {
  const units = data.properties.map((p) => section(p, "units")); const rent = data.properties.map((p) => section(p, "rentRoll")); const collections = data.properties.map((p) => section(p, "collections"));
  return <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Souhrn portfolia</Text><View style={styles.section}><Text style={styles.h2}>Výkonné shrnutí</Text><Text style={styles.body}>{data.executiveSummary || "Bez výkonného shrnutí."}</Text></View><View style={styles.grid}>
    <Metric label="Jednotky celkem" value={integer(aggregateKnownReportValues(units.map((v) => v.total)))}/><Metric label="Obsazené jednotky" value={integer(aggregateKnownReportValues(units.map((v) => v.occupied)))}/><Metric label="Volné jednotky" value={integer(aggregateKnownReportValues(units.map((v) => v.vacant)))}/>
    <Metric label="Měsíční čisté nájemné" value={money(aggregateKnownReportValues(rent.map((v) => v.monthlyNetRentCents)))}/><Metric label="Kvartální předpis" value={money(aggregateKnownReportValues(collections.map((v) => v.quarterExpectedCents)))}/><Metric label="Kvartální úhrady" value={money(aggregateKnownReportValues(collections.map((v) => v.quarterPaidCents)))}/><Metric label="Dluh po splatnosti" value={money(aggregateKnownReportValues(collections.map((v) => v.overdueDebtCents)))}/>
  </View><View style={styles.section}><Text style={styles.h2}>Kvalita a původ dat</Text>{data.properties.map((property) => { const counts = { INFO: 0, WARNING: 0, BLOCKER: 0 }; property.snapshot.quality.issues.forEach((issue) => counts[issue.severity]++); return <View style={styles.quality} key={property.propertyName}><Text style={styles.h3}>{property.propertyName}</Text><Text style={styles.muted}>{sourceLabel(property.snapshot.source)} · INFO {counts.INFO} · UPOZORNĚNÍ {counts.WARNING} · BLOKUJÍCÍ {counts.BLOCKER}</Text>{property.snapshot.quality.issues.length > 0 && <Text>{[...new Set(property.snapshot.quality.issues.map((issue) => issue.label))].join(" · ")}</Text>}<Text style={styles.muted}>Schéma {property.snapshot.schemaVersion} · kalkulátor {property.snapshot.calculatorVersion}</Text></View>; })}</View></Page>;
}

function PropertyPage({ data, property }: { data: FrozenQuarterlyReportPdfData; property: FrozenQuarterlyReportPdfProperty }) {
  const units = section(property, "units"), rent = section(property, "rentRoll"), collections = section(property, "collections"), deposits = section(property, "deposits"), leases = section(property, "leases");
  return <Page size="A4" style={styles.page} wrap><Footer data={data}/><View style={styles.propertyHeader}><Text style={styles.h1}>{property.propertyName}</Text><Text style={styles.propertyAddress}>{property.propertyAddress}</Text><Text style={styles.badge}>{property.propertyStatus ? propertyStatusLabels[property.propertyStatus] : "Stav neuveden"}</Text></View>
    <Text style={styles.h2}>Klíčové ukazatele</Text><View style={styles.grid}><Metric label="Jednotky celkem / pronajímatelné" value={`${integer(units.total)} / ${integer(units.rentable)}`}/><Metric label="Obsazené / volné" value={`${integer(units.occupied)} / ${integer(units.vacant)}`}/><Metric label="Rekonstrukce / neaktivní" value={`${integer(units.renovation)} / ${integer(units.inactive)}`}/><Metric label="Měsíční čisté nájemné" value={money(rent.monthlyNetRentCents)}/><Metric label="Měsíční služby" value={money(rent.monthlyServicesCents)}/><Metric label="Měsíční celkem" value={money(rent.monthlyTotalCents)}/></View>
    <View wrap={false}><Text style={styles.h2}>Rent roll a inkaso</Text><TableRows rows={[["Pronajímatelná / obsazená plocha", `${decimal(rent.rentableAreaM2, " m²")} / ${decimal(rent.occupiedAreaM2, " m²")}`],["Vážené čisté nájemné / m²", money(rent.weightedNetRentPerM2Cents)],["Kvartální předpis / úhrady", `${money(collections.quarterExpectedCents)} / ${money(collections.quarterPaidCents)}`],["Míra inkasa", percentBps(collections.collectionRateBps)],["Dluh po splatnosti", money(collections.overdueDebtCents)]]}/></View>
    <View wrap={false}><Text style={styles.h2}>Kauce a smlouvy</Text><TableRows rows={[["Kauce sjednáno / drženo", `${money(deposits.agreedCents)} / ${money(deposits.heldPrincipalCents)}`],["Chybějící kauce", money(deposits.missingCents)],["Kauce: financované / částečné / neuhrazené / k vypořádání", `${integer(deposits.fundedLeases)} / ${integer(deposits.partialLeases)} / ${integer(deposits.unpaidLeases)} / ${integer(deposits.toSettleLeases)}`],["Smlouvy: aktivní / budoucí / končící do 90 dnů / ukončené YTD", `${integer(leases.active)} / ${integer(leases.future)} / ${integer(leases.expiring90Days)} / ${integer(leases.endedYtd)}`]]}/></View>
    <View wrap={false}><Text style={styles.h2}>Komentář managementu</Text><View style={styles.note}><Text>{property.managementCommentary || "Bez komentáře."}</Text></View></View>
    {property.technicalSections.length > 0 && <View><Text style={styles.h2}>Technický stav</Text>{property.technicalSections.map((item, index) => <View style={styles.technical} wrap={false} key={`${item.title}-${index}`}><Text style={styles.h3}>{item.title}</Text><Text style={styles.status}>{item.status ? technicalStatusLabels[item.status] : "Bez stavu"}</Text><Text>{item.commentary || "Bez komentáře."}</Text></View>)}</View>}
    {property.valuationRows.length > 0 && <ValuationTable property={property}/>}
    <View style={styles.provenance}><Text>{sourceLabel(property.snapshot.source)} · schéma {property.snapshot.schemaVersion} · kalkulátor {property.snapshot.calculatorVersion}</Text>{property.snapshot.sourceNote && <Text>Poznámka ke zdroji: {property.snapshot.sourceNote}</Text>}</View>
  </Page>;
}

function QuarterlyReportPdf({ data }: { data: FrozenQuarterlyReportPdfData }) { return <Document title={`Kvartální report ${data.reportingGroupName} Q${data.quarter} ${data.year}`} author="FlatCloud" subject={`Snapshot-based immutable quarterly report · ${REPORT_PDF_RENDERER_VERSION}`} creator={`FlatCloud ${REPORT_PDF_RENDERER_VERSION}`} producer={`FlatCloud ${REPORT_PDF_RENDERER_VERSION}`} creationDate={data.publishedAt} modificationDate={data.publishedAt}>
  <Page size="A4" style={[styles.page, styles.cover]}><View><Image src={REPORT_PDF_LOGO_PATH} style={styles.logo}/><Text style={styles.coverTitle}>Kvartální report</Text><Text style={styles.coverGroup}>{data.reportingGroupName}</Text><Text style={styles.coverPeriod}>Q{data.quarter} / {data.year} · revize {data.revision}</Text></View><View style={styles.coverMeta}><Text>Rozhodné datum: {reportDate(data.asOfDate)}</Text><Text>Publikováno: {data.publishedAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}</Text><Text style={{ marginTop: 8 }}>Report vychází výhradně z neměnných kvartálních snapshotů.</Text><Text>PDF renderer: {REPORT_PDF_RENDERER_VERSION}</Text></View></Page>
  <PortfolioSummary data={data}/>{data.properties.map((property, index) => <PropertyPage data={data} property={property} key={`${property.propertyName}-${index}`}/>)}
  <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Provenience reportu</Text><Text>Publikováno: {data.publishedAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}</Text><Text style={{ marginTop: 8 }}>Tento dokument je neměnným publikovaným výstupem sestaveným z kvartálních snapshotů a zmrazeného redakčního obsahu.</Text><Text style={styles.provenance}>FlatCloud · PDF renderer {REPORT_PDF_RENDERER_VERSION}</Text></Page>
</Document>; }

export async function renderQuarterlyReportPdf(data: FrozenQuarterlyReportPdfData): Promise<Uint8Array> { return new Uint8Array(await renderToBuffer(<QuarterlyReportPdf data={data}/>)); }
