import path from "node:path";
import React from "react";
import { Circle, Document, Font, Image, Line, Page, Polygon, Polyline, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReportDesignPageRole } from "@prisma/client";
import type { ReportDesignTemplateConfig } from "@/lib/reporting/design-template-schema";
import type { QuarterlyPropertyPresentation, PresentationTrendPoint } from "../quarterly-property-presentation-model";
import type { QuarterlyPropertyPdfAssets } from "./quarterly-property-pdf-assets";
import { buildQuarterlyPropertyPdfPagePlan, type QuarterlyPropertyPdfPage } from "./quarterly-property-pdf-plan";

export const A4_LANDSCAPE_WIDTH = 841.89;
export const A4_LANDSCAPE_HEIGHT = 595.28;
export const A4_LANDSCAPE_PAGE_SIZE = { width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT } as const;
const FONT_FAMILY = "FlatCloudPdfFallback";
Font.register({ family: FONT_FAMILY, src: path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-latin-ext-400-normal.woff") });
Font.register({ family: FONT_FAMILY, src: path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-latin-ext-700-normal.woff"), fontWeight: 700 });

const styles = StyleSheet.create({
  page: { width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT, fontFamily: FONT_FAMILY, fontSize: 9, color: "#1F2937", position: "relative" },
  pageCanvas: { position: "absolute", left: 0, top: 0, width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT },
  absolute: { position: "absolute" },
  footer: { position: "absolute", flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.7, paddingTop: 4, fontSize: 7 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  kicker: { fontSize: 8, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" },
  bodyText: { fontSize: 10, lineHeight: 1.55, whiteSpace: "pre-wrap" },
  technicalGrid: { flexDirection: "row", flexWrap: "wrap" },
  technicalCell: { width: "33.333%", height: "33.333%", borderWidth: 0.7 },
  technicalBand: { height: 24, justifyContent: "center", paddingHorizontal: 5 },
  technicalTitle: { color: "white", textAlign: "center", fontWeight: 700, fontSize: 8 },
  technicalBody: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 7 },
  technicalComment: { textAlign: "center", fontSize: 8, lineHeight: 1.35 },
  table: { borderWidth: 0.7 }, row: { flexDirection: "row", minHeight: 20, borderBottomWidth: 0.5, alignItems: "center" },
  th: { color: "white", fontWeight: 700 }, cell: { paddingHorizontal: 5, fontSize: 8 },
  total: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, paddingTop: 7, fontWeight: 700 },
  charts: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, chart: { width: "48.8%", height: "47%", borderWidth: 0.7, padding: 8 }, chartTitle: { fontWeight: 700, fontSize: 9, marginBottom: 4 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", color: "#7A7A7A" },
});

type Rect = { x: number; y: number; width: number; height: number };
const rect = (value: Rect) => ({ left: value.x * A4_LANDSCAPE_WIDTH, top: value.y * A4_LANDSCAPE_HEIGHT, width: value.width * A4_LANDSCAPE_WIDTH, height: value.height * A4_LANDSCAPE_HEIGHT });
const points = (value: Array<[number, number]>) => value.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ");
const money = (value: number | null | undefined) => value == null ? "—" : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

function GeneratedHeader({ model }: { model: QuarterlyPropertyPresentation }) {
  const config = model.template.config;
  return <Svg preserveAspectRatio="none" style={[styles.absolute, { left: 0, top: 0, width: A4_LANDSCAPE_WIDTH, height: config.contentHeader.height * A4_LANDSCAPE_HEIGHT }]} viewBox={`0 0 1000 ${config.contentHeader.height * 1000}`}>
      <Polygon points={points(config.contentHeader.darkPolygon)} fill={config.brand.primaryDark}/>
      <Polygon points={points(config.contentHeader.lightPolygon)} fill={config.brand.primaryLight}/>
    </Svg>;
}

function ContentHeaderLabels({ model, logo }: { model: QuarterlyPropertyPresentation; logo: string }) {
  const config = model.template.config;
  return <>
    <Text style={[styles.absolute, rect(config.contentHeader.reportLabelRect), { color: config.brand.white, fontSize: 8 }]}>Kvartální report · Q{model.report.quarter} {model.report.year}</Text>
    <Text style={[styles.absolute, rect(config.contentHeader.propertyTitleRect), { color: config.brand.white, fontSize: 18, fontWeight: 700 }]}>{model.property.name}</Text>
    <Image src={logo} style={[styles.absolute, rect(config.contentHeader.logoRect), { objectFit: "contain" }]}/>
  </>;
}

function Footer({ model }: { model: QuarterlyPropertyPresentation }) {
  const config = model.template.config;
  return <View fixed style={[styles.footer, rect(config.footer), { borderColor: config.brand.border, color: config.brand.muted }]}><Text>{model.property.name}</Text><Text>Q{model.report.quarter} {model.report.year}</Text></View>;
}

function ContentFrame({ model, assets, role, forceGenerated, children }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; role: Exclude<ReportDesignPageRole, "COVER">; forceGenerated?: boolean; children: React.ReactNode }) {
  const mode = forceGenerated ? "GENERATED" : model.template.backgrounds[role].mode;
  return <Page size={A4_LANDSCAPE_PAGE_SIZE} style={styles.page}>
    {mode === "ASSET" && assets.backgrounds[role] && <Image src={assets.backgrounds[role]} style={[styles.absolute, { left: 0, top: 0, width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT }]}/>} 
    {mode === "GENERATED" && <GeneratedHeader model={model}/>} 
    <ContentHeaderLabels model={model} logo={assets.logo}/>
    {children}<Footer model={model}/>
  </Page>;
}

function PageTitle({ title, continuation }: { title: string; continuation: number }) { return <Text style={styles.heading}>{title}{continuation > 1 ? ` · pokračování ${continuation}` : ""}</Text>; }

function Cover({ model, assets }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets }) {
  const config = model.template.config;
  return <Page size={A4_LANDSCAPE_PAGE_SIZE} style={styles.page}>
    <View style={styles.pageCanvas} wrap={false}>
      <View style={[styles.absolute, rect(config.cover.brandRect), { backgroundColor: config.brand.primary }]}/>
      {assets.primary ? <Image src={assets.primary} style={[styles.absolute, rect(config.cover.imageRect), { objectFit: "cover" }]}/> : <View style={[styles.absolute, rect(config.cover.imageRect), { backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: config.brand.muted }}>Fotografie není k dispozici</Text></View>}
      <Image src={assets.logo} style={[styles.absolute, rect(config.cover.logoRect), { objectFit: "contain" }]}/>
      <View style={[styles.absolute, rect(config.cover.titleRect)]}><Text style={{ color: config.brand.white, fontSize: 25, fontWeight: 700 }}>{model.property.name}</Text><Text style={{ color: config.brand.white, fontSize: 10, marginTop: 7 }}>{model.property.address}</Text></View>
      <Text style={[styles.absolute, rect(config.cover.periodRect), { color: config.brand.white, fontSize: 13 }]}>Kvartální report · Q{model.report.quarter} {model.report.year}</Text>
    </View>
  </Page>;
}

function Overview({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "OVERVIEW" }> }) {
  const config = model.template.config, first = page.continuation === 1;
  return <ContentFrame model={model} assets={assets} role="OVERVIEW"><View style={[styles.absolute, rect(config.pages.OVERVIEW.commentaryRect)]}><Text style={[styles.kicker, { color: config.brand.primary }]}>{model.property.status || "Přehled nemovitosti"}</Text><PageTitle title="Komentář managementu" continuation={page.continuation}/><Text style={styles.bodyText}>{page.content}</Text></View>{first && (assets.supportive ? <View style={[styles.absolute, rect(config.pages.OVERVIEW.supportiveImageRect)]}><Image src={assets.supportive} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>{config.mediaSlots.supportive.treatment === "BLUE_VEIL" && <View style={[styles.absolute, { left: 0, top: 0, width: "100%", height: "100%", backgroundColor: config.brand.primary, opacity: config.mediaSlots.supportive.blueVeilOpacity }]}/>} {model.media.supportive?.caption && <Text style={{ position: "absolute", bottom: 6, left: 7, right: 7, color: "white", fontSize: 7 }}>{model.media.supportive.caption}</Text>}</View> : <View style={[styles.absolute, rect(config.pages.OVERVIEW.supportiveImageRect), { backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: config.brand.muted }}>Podpůrná fotografie není k dispozici</Text></View>)}</ContentFrame>;
}

function Technical({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "TECHNICAL" }> }) {
  const config = model.template.config;
  return <ContentFrame model={model} assets={assets} role="TECHNICAL"><View style={[styles.absolute, rect(config.pages.TECHNICAL.bodyRect)]}><PageTitle title="Technický stav" continuation={page.continuation}/>{page.sections.length ? <View style={styles.technicalGrid}>{page.sections.map((section, index) => <View key={`${section.title}-${index}`} style={[styles.technicalCell, { borderColor: config.brand.primary }]}><View style={[styles.technicalBand, { backgroundColor: config.brand.primary }]}><Text style={styles.technicalTitle}>{section.title}</Text></View><View style={styles.technicalBody}><Text style={styles.technicalComment}>{section.commentary || "Bez komentáře."}</Text></View></View>)}</View> : <View style={styles.empty}><Text>Technické oblasti nebyly doplněny.</Text></View>}</View></ContentFrame>;
}

function Valuation({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "VALUATION" }> }) {
  const config = model.template.config, widths = ["28%", "18%", "14%", "14%", "26%"] as const;
  const cells = (values: string[], header = false) => values.map((value, index) => <Text key={index} style={[styles.cell, { width: widths[index] }, header ? styles.th : {}]}>{value}</Text>);
  return <ContentFrame model={model} assets={assets} role="VALUATION"><View style={[styles.absolute, rect(config.pages.VALUATION.bodyRect)]}><PageTitle title="Ocenění" continuation={page.continuation}/><View style={[styles.table, { borderColor: config.brand.border }]}><View style={[styles.row, { backgroundColor: config.brand.primary, borderBottomColor: config.brand.border }]}>{cells(["Jednotka / položka", "Dispozice", "Podlaží", "Plocha m²", "Ocenění"], true)}</View>{page.rows.map((row, index) => <View key={index} style={[styles.row, { borderBottomColor: config.brand.border }]}>{"kind" in row ? cells([row.unitLabel, row.disposition || "—", row.floor || "—", number(row.areaM2), money(row.amountCents)]) : cells([row.label, "Starší formát", "—", "—", row.amountCents != null ? money(row.amountCents) : row.valueLabel || "—"])}</View>)}{!page.rows.length && <View style={styles.row}>{cells(["Ocenění nebylo doplněno.", "", "", "", ""])}</View>}</View>{page.final && <View style={[styles.total, { borderColor: config.brand.primary }]}><Text>Celková hodnota</Text><Text>{money(model.valuationTotalCents)}</Text></View>}</View></ContentFrame>;
}

function MiniChart({ title, points: trendPoints, field, color }: { title: string; points: PresentationTrendPoint[]; field: keyof Omit<PresentationTrendPoint, "label">; color: string }) {
  const values = trendPoints.map((point) => point[field]).filter((value): value is number => typeof value === "number");
  if (!values.length) return <View style={styles.chart}><Text style={styles.chartTitle}>{title}</Text><View style={styles.empty}><Text>Pro toto období nejsou dostupná data.</Text></View></View>;
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || Math.max(Math.abs(max), 1);
  const coords = trendPoints.map((point, index) => typeof point[field] === "number" ? { x: trendPoints.length === 1 ? 100 : 12 + index * 176 / (trendPoints.length - 1), y: 75 - ((point[field] as number) - min) / spread * 50 } : null);
  const segments: string[] = []; let current: string[] = [];
  coords.forEach((point) => { if (point) current.push(`${point.x},${point.y}`); else if (current.length) { segments.push(current.join(" ")); current = []; } }); if (current.length) segments.push(current.join(" "));
  return <View style={styles.chart}><Text style={styles.chartTitle}>{title}</Text><Svg viewBox="0 0 200 88" style={{ width: "100%", height: 65 }}>{[25, 50, 75].map((y) => <Line key={y} x1={8} y1={y} x2={192} y2={y} stroke="#D7E1EA" strokeWidth={0.6}/>)}{segments.map((segment, index) => <Polyline key={index} points={segment} fill="none" stroke={color} strokeWidth={2}/>)}{coords.map((point, index) => point && <Circle key={index} cx={point.x} cy={point.y} r={2.2} fill={color}/>)}</Svg><View style={{ flexDirection: "row", justifyContent: "space-between" }}>{trendPoints.map((point, index) => <Text key={index} style={{ fontSize: 6 }}>{point.label}</Text>)}</View></View>;
}

function Trends({ model, assets }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets }) {
  const config = model.template.config;
  return <ContentFrame model={model} assets={assets} role="TRENDS"><View style={[styles.absolute, rect(config.pages.TRENDS.bodyRect)]}><PageTitle title="Vývoj hlavních ukazatelů" continuation={1}/>{model.trends.length ? <View style={styles.charts}><MiniChart title="Obsazenost" points={model.trends} field="occupancyPercent" color={config.brand.primary}/><MiniChart title="Měsíční čisté nájemné" points={model.trends} field="monthlyNetRentCents" color={config.brand.primary}/><MiniChart title="Úspěšnost inkasa" points={model.trends} field="collectionRatePercent" color={config.brand.primary}/><MiniChart title="Dluh po splatnosti" points={model.trends} field="overdueDebtCents" color={config.brand.primary}/></View> : <View style={styles.empty}><Text>Historická data zatím nejsou dostupná.</Text></View>}</View></ContentFrame>;
}

function Additional({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "ADDITIONAL_COMMENTARY" }> }) {
  return <ContentFrame model={model} assets={assets} role="TRENDS" forceGenerated><View style={[styles.absolute, rect(model.template.config.pages.TRENDS.bodyRect)]}><PageTitle title="Doplňující komentář" continuation={page.continuation}/><Text style={styles.bodyText}>{page.content}</Text></View></ContentFrame>;
}

export function QuarterlyPropertyLandscapePdfDocument({ model, assets }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets }) {
  const plan = buildQuarterlyPropertyPdfPagePlan(model);
  return <Document title={`Kvartální report ${model.property.name} Q${model.report.quarter} ${model.report.year}`} author="FlatCloud" creator="FlatCloud property preview">
    {plan.map((page, index) => page.kind === "COVER" ? <Cover key={index} model={model} assets={assets}/> : page.kind === "OVERVIEW" ? <Overview key={index} model={model} assets={assets} page={page}/> : page.kind === "TECHNICAL" ? <Technical key={index} model={model} assets={assets} page={page}/> : page.kind === "VALUATION" ? <Valuation key={index} model={model} assets={assets} page={page}/> : page.kind === "TRENDS" ? <Trends key={index} model={model} assets={assets}/> : <Additional key={index} model={model} assets={assets} page={page}/>) }
  </Document>;
}

export async function renderQuarterlyPropertyLandscapePdf(model: QuarterlyPropertyPresentation, assets: QuarterlyPropertyPdfAssets) {
  return new Uint8Array(await renderToBuffer(<QuarterlyPropertyLandscapePdfDocument model={model} assets={assets}/>));
}
