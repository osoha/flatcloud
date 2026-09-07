import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { REPORT_PDF_FONT_PATH, REPORT_PDF_LOGO_PATH } from "./assets";
import type { FrozenAnnualReportPdfData, FrozenAnnualReportPdfProperty } from "./annual-report-pdf-data";

export const ANNUAL_REPORT_PDF_RENDERER_VERSION = "r13b-annual-v1";
const FONT_FAMILY = "FlatCloudNotoSans";
Font.register({ family: FONT_FAMILY, src: REPORT_PDF_FONT_PATH });
const colors = { ink: "#172033", muted: "#667085", blue: "#2667ff", pale: "#eef3ff", line: "#d9e1ef", white: "#ffffff", navy: "#12234a" };
const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 9, color: colors.ink, paddingTop: 44, paddingHorizontal: 42, paddingBottom: 46, lineHeight: 1.45 },
  cover: { paddingTop: 70, justifyContent: "space-between", backgroundColor: colors.navy, color: colors.white },
  logo: { width: 138, height: 40, objectFit: "contain", objectPosition: "left" },
  coverTitle: { fontSize: 31, marginTop: 90 }, coverGroup: { fontSize: 18, marginTop: 14 }, coverYear: { fontSize: 14, color: "#86a9ff", marginTop: 8 },
  coverMeta: { color: "#c7d3ed", borderTopWidth: 1, borderTopColor: "#53658c", paddingTop: 16 },
  h1: { fontSize: 21, marginBottom: 14 }, h2: { fontSize: 13, marginTop: 14, marginBottom: 7 }, h3: { fontSize: 10, marginBottom: 4 }, body: { fontSize: 9 }, muted: { color: colors.muted },
  section: { marginBottom: 14 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, metric: { width: "31.8%", padding: 9, backgroundColor: colors.pale, borderRadius: 3 }, metricLabel: { fontSize: 7, color: colors.muted, marginBottom: 3 }, metricValue: { fontSize: 12 },
  note: { padding: 10, borderLeftWidth: 3, borderLeftColor: colors.blue, backgroundColor: "#f8faff", marginBottom: 8 },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: 3 }, row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 24, alignItems: "center" }, lastRow: { borderBottomWidth: 0 },
  propertyCell: { width: "34%", padding: 6 }, valueCell: { width: "22%", padding: 6, textAlign: "right" },
  propertyHeader: { borderBottomWidth: 2, borderBottomColor: colors.blue, paddingBottom: 10, marginBottom: 12 }, propertyAddress: { color: colors.muted, marginTop: 3 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 20, flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 },
  provenance: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, color: colors.muted, fontSize: 7 },
});

const dash = "—";
const date = (value: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const money = (value: bigint | null) => value === null ? dash : `${(value / BigInt(100)).toLocaleString("cs-CZ")} Kč`;
const count = (value: number | null) => value === null ? dash : value.toLocaleString("cs-CZ");
function Footer({ data }: { data: FrozenAnnualReportPdfData }) { return <View style={styles.footer} fixed><Text>FlatCloud · Výroční report {data.year} · revize {data.revision}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}/></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Narrative({ title, value }: { title: string; value: string | null }) { return <View style={styles.section} wrap={false}><Text style={styles.h2}>{title}</Text><View style={styles.note}><Text>{value || "Bez textu."}</Text></View></View>; }

function PortfolioPage({ data }: { data: FrozenAnnualReportPdfData }) { return <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Portfolio a hodnota</Text><View style={styles.grid}>
  <Metric label="Hrubá hodnota aktiv" value={money(data.grossAssetValueCents)}/><Metric label="Čistá hodnota aktiv" value={money(data.netAssetValueCents)}/><Metric label="Dluh" value={money(data.debtCents)}/><Metric label="Cílová hodnota portfolia" value={money(data.targetPortfolioValueCents)}/><Metric label="Cena akcie" value={money(data.sharePriceCents)}/><Metric label="Akcie v oběhu" value={data.issuedShares === null || data.treasuryShares === null ? dash : count(data.issuedShares - data.treasuryShares)}/><Metric label="Realizované exity" value={money(data.realizedExitProceedsCents)}/><Metric label="Plánované exity" value={money(data.plannedExitProceedsCents)}/>
  </View><Narrative title="Manažerské shrnutí" value={data.executiveSummary}/><Narrative title="Investiční teze" value={data.investmentThesis}/><Narrative title="Tvorba hodnoty" value={data.valueCreationSummary}/><Narrative title="Výhled" value={data.outlook}/></Page>; }

function PropertyTable({ data }: { data: FrozenAnnualReportPdfData }) { return <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Přehled nemovitostí</Text><View style={styles.table}><View style={[styles.row, { backgroundColor: colors.pale }]}><Text style={styles.propertyCell}>Nemovitost</Text><Text style={styles.valueCell}>Počátek roku</Text><Text style={styles.valueCell}>Konec roku</Text><Text style={styles.valueCell}>Cíl</Text></View>{data.properties.map((property, index) => <View style={[styles.row, index === data.properties.length - 1 ? styles.lastRow : {}]} key={property.propertyName}><Text style={styles.propertyCell}>{property.propertyName}</Text><Text style={styles.valueCell}>{money(property.openingValueCents)}</Text><Text style={styles.valueCell}>{money(property.currentValueCents)}</Text><Text style={styles.valueCell}>{money(property.targetValueCents)}</Text></View>)}</View></Page>; }

function PropertyPage({ data, property }: { data: FrozenAnnualReportPdfData; property: FrozenAnnualReportPdfProperty }) { return <Page size="A4" style={styles.page}><Footer data={data}/><View style={styles.propertyHeader}><Text style={styles.h1}>{property.propertyName}</Text><Text style={styles.propertyAddress}>{property.propertyAddress}</Text></View><View style={styles.grid}><Metric label="Hodnota na začátku roku" value={money(property.openingValueCents)}/><Metric label="Hodnota ke konci roku" value={money(property.currentValueCents)}/><Metric label="Cílová hodnota" value={money(property.targetValueCents)}/><Metric label="Realizovaný exit" value={money(property.realizedExitProceedsCents)}/><Metric label="Plánovaný exit" value={money(property.plannedExitProceedsCents)}/><Metric label="Plánovaný rok exitu" value={property.plannedExitYear?.toString() || dash}/></View><Narrative title="Investiční případ" value={property.investmentCase}/><Narrative title="Tvorba hodnoty v roce" value={property.valueCreationNarrative}/><Narrative title="Výhled a milníky" value={property.outlook}/><View style={styles.provenance}><Text>Zdroj hodnot: {property.sourceNote || dash}</Text><Text>Q4 snapshot revize {property.snapshot.revision} · {property.snapshot.source} · schéma {property.snapshot.schemaVersion} · kalkulátor {property.snapshot.calculatorVersion}</Text><Text>Fingerprint snapshotu: {property.snapshot.fingerprint}</Text></View></Page>; }

function AnnualReportPdf({ data }: { data: FrozenAnnualReportPdfData }) { return <Document title={`Výroční report ${data.reportingGroupName} ${data.year}`} author="FlatCloud" subject={`Snapshot-based immutable annual shareholder report · ${ANNUAL_REPORT_PDF_RENDERER_VERSION}`} creator={`FlatCloud ${ANNUAL_REPORT_PDF_RENDERER_VERSION}`} producer={`FlatCloud ${ANNUAL_REPORT_PDF_RENDERER_VERSION}`} creationDate={data.asOfDate} modificationDate={data.asOfDate}>
  <Page size="A4" style={[styles.page, styles.cover]}><View><Image src={REPORT_PDF_LOGO_PATH} style={styles.logo}/><Text style={styles.coverTitle}>Výroční report</Text><Text style={styles.coverGroup}>{data.reportingGroupName}</Text><Text style={styles.coverYear}>{data.year} · revize {data.revision}</Text></View><View style={styles.coverMeta}><Text>Rozhodné datum: {date(data.asOfDate)}</Text><Text>Interní akcionářský dokument</Text><Text style={{ marginTop: 8 }}>Neměnný výstup ze zmrazených Q4 snapshotů a výroční redakční vrstvy.</Text><Text>PDF renderer: {ANNUAL_REPORT_PDF_RENDERER_VERSION}</Text></View></Page>
  <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Slovo zakladatele</Text><Text style={styles.body}>{data.founderLetter || "Bez textu."}</Text></Page><PortfolioPage data={data}/><PropertyTable data={data}/>{data.properties.map((property) => <PropertyPage data={data} property={property} key={property.propertyName}/>)}
  <Page size="A4" style={styles.page}><Footer data={data}/><Text style={styles.h1}>Provenience reportu</Text><Text>Rozhodné datum: {date(data.asOfDate)}</Text><Text style={{ marginTop: 8 }}>Dokument je sestaven pouze ze zmrazených reportovacích řádků a připojených Q4 snapshotů. Každý snapshot je identifikován fingerprintem obsahu.</Text><Text style={styles.provenance}>FlatCloud · {ANNUAL_REPORT_PDF_RENDERER_VERSION} · interní akcionářský report</Text></Page>
  </Document>; }

export async function renderAnnualReportPdf(data: FrozenAnnualReportPdfData): Promise<Uint8Array> { return new Uint8Array(await renderToBuffer(<AnnualReportPdf data={data}/>)); }
