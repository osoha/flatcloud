import path from "node:path";
import fs from "node:fs";
import React from "react";
import { Circle, Document, Font, Image, Line, Page, Polyline, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument as StampDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportDesignPageRole } from "@prisma/client";
import type { ReportDesignTemplateConfig } from "@/lib/reporting/design-template-schema";
import type { QuarterlyPropertyPresentation, PresentationTrendPoint } from "../quarterly-property-presentation-model";
import type { QuarterlyPropertyPdfAssets } from "./quarterly-property-pdf-assets";
import { buildQuarterlyPropertyPdfPagePlan, type QuarterlyPropertyPdfPage } from "./quarterly-property-pdf-plan";
import reportDesignParity from "../report-design-parity";

const { contentLogoRect, coverNarrativeRect, reportCoverPeriodLabel, reportMasterLabel, reportPeriodLabel } = reportDesignParity;

export const A4_LANDSCAPE_WIDTH = 841.89;
export const A4_LANDSCAPE_HEIGHT = 595.28;
export const A4_LANDSCAPE_PAGE_SIZE = { width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT } as const;
export const FLATCLOUD_PAGE_WIDTH = 780;
export const FLATCLOUD_PAGE_HEIGHT = 540;
export const FLATCLOUD_PAGE_SIZE = { width: FLATCLOUD_PAGE_WIDTH, height: FLATCLOUD_PAGE_HEIGHT } as const;
const FONT_FAMILY = "FlatCloudRaleway";
Font.register({ family: FONT_FAMILY, src: path.join(process.cwd(), "public", "fonts", "Raleway-Regular.ttf") });
Font.register({ family: FONT_FAMILY, src: path.join(process.cwd(), "public", "fonts", "Raleway-Bold.ttf"), fontWeight: 700 });

const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 9, color: "#1F2937", position: "relative" },
  absolute: { position: "absolute" },
  footer: { position: "absolute", flexDirection: "row", justifyContent: "space-between", fontSize: 7.5 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  overviewHeading: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  bodyText: { fontSize: 10, lineHeight: 1.18, whiteSpace: "pre-wrap" },
  technicalGrid: { flexDirection: "row", flexWrap: "wrap" },
  technicalCell: { width: "33.333%", height: "33.333%", borderWidth: 0.7 },
  technicalBand: { height: 33, justifyContent: "center", paddingHorizontal: 5 },
  technicalTitle: { color: "white", textAlign: "center", fontWeight: 700, fontSize: 10 },
  technicalBody: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 7 },
  technicalComment: { textAlign: "center", fontSize: 10, lineHeight: 1.2 },
  table: { borderWidth: 0.7 }, row: { flexDirection: "row", minHeight: 20, borderBottomWidth: 0.5, alignItems: "center" },
  th: { color: "white", fontWeight: 700 }, cell: { paddingHorizontal: 5, fontSize: 8 },
  total: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, paddingTop: 7, fontWeight: 700 },
  charts: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, chart: { width: "48.8%", height: "47%", borderWidth: 0.7, padding: 8 }, chartTitle: { fontWeight: 700, fontSize: 9, marginBottom: 4 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", color: "#7A7A7A" },
});

type Rect = { x: number; y: number; width: number; height: number };
type PageSize = { width: number; height: number };
const pageSize = (config: ReportDesignTemplateConfig): PageSize => config.page.format === "FLATCLOUD_13X9" ? FLATCLOUD_PAGE_SIZE : A4_LANDSCAPE_PAGE_SIZE;
const rect = (value: Rect, size: PageSize) => ({ left: value.x * size.width, top: value.y * size.height, width: value.width * size.width, height: value.height * size.height });
const money = (value: number | null | undefined) => value == null ? "—" : `${(value / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

function Footer({ model }: { model: QuarterlyPropertyPresentation }) {
  const config = model.template.config, size = pageSize(config);
  return <View style={[styles.footer, rect(config.footer, size), { color: config.brand.muted }]}><Text>FlatCloud | {reportPeriodLabel(model.report.quarter, model.report.year)}</Text><Text render={({ pageNumber }) => `${pageNumber}`}/></View>;
}

function ContentFrame({ model, assets, role, forceGenerated, children }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; role: Exclude<ReportDesignPageRole, "COVER">; forceGenerated?: boolean; children: React.ReactNode }) {
  const mode = forceGenerated ? "GENERATED" : model.template.backgrounds[role].mode;
  const size = pageSize(model.template.config);
  return <Page size={size} style={styles.page}>
    {mode === "ASSET" && assets.backgrounds[role] && (
      <Image src={assets.backgrounds[role]} style={[styles.absolute, { left: 0, top: 0, width: size.width, height: size.height }]}/>
    )}
    {children}
    <Footer model={model}/>
  </Page>;
}

function PageTitle({ title, continuation }: { title: string; continuation: number }) { return <Text style={styles.heading}>{title}{continuation > 1 ? ` · pokračování ${continuation}` : ""}</Text>; }

function Cover({ model, assets }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets }) {
  const config = model.template.config, size = pageSize(config);
  return <Page size={size} style={styles.page}>
    <View fixed style={[styles.absolute, rect(config.cover.brandRect, size), { backgroundColor: config.brand.primary }]}/>
    {assets.primary ? <Image fixed src={assets.primary} style={[styles.absolute, rect(config.cover.imageRect, size), { objectFit: "cover" }]}/> : <View fixed style={[styles.absolute, rect(config.cover.imageRect, size), { backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: config.brand.muted }}>Fotografie není k dispozici</Text></View>}
    <Image fixed src={assets.logo} style={[styles.absolute, rect(config.cover.logoRect, size), { objectFit: "cover" }]}/>
    <View fixed style={[styles.absolute, rect(coverNarrativeRect(config.cover.titleRect), size)]}><Text style={{ color: config.brand.white, fontSize: 30 }}>{model.property.name}</Text><Text style={{ color: config.brand.white, fontSize: 16, marginTop: 7 }}>Kvartální report - {reportCoverPeriodLabel(model.report.quarter, model.report.year)}</Text></View>
  </Page>;
}

function Overview({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "OVERVIEW" }> }) {
  const config = model.template.config, size = pageSize(config), first = page.continuation === 1;
  const supportive = assets.supportive ? <View style={[styles.absolute, rect(config.pages.OVERVIEW.supportiveImageRect, size)]}>
    <Image src={assets.supportive} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
    {config.mediaSlots.supportive.treatment === "BLUE_VEIL" && <View style={[styles.absolute, { left: 0, top: 0, width: "100%", height: "100%", backgroundColor: config.brand.primary, opacity: config.mediaSlots.supportive.blueVeilOpacity }]}/>}
    {model.media.supportive?.caption && <Text style={{ position: "absolute", bottom: 6, left: 7, right: 7, color: "white", fontSize: 7 }}>{model.media.supportive.caption}</Text>}
  </View> : <View style={[styles.absolute, rect(config.pages.OVERVIEW.supportiveImageRect, size), { backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: config.brand.muted }}>Podpůrná fotografie není k dispozici</Text></View>;
  return <ContentFrame model={model} assets={assets} role="OVERVIEW">
    <View style={[styles.absolute, rect(config.pages.OVERVIEW.commentaryRect, size)]}><Text style={[styles.overviewHeading, { color: config.brand.primary }]}>Komentář{page.continuation > 1 ? ` · pokračování ${page.continuation}` : ""}</Text><Text style={styles.bodyText}>{page.content}</Text></View>
    {first && supportive}
  </ContentFrame>;
}

function Technical({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "TECHNICAL" }> }) {
  const config = model.template.config, size = pageSize(config);
  return <ContentFrame model={model} assets={assets} role="TECHNICAL"><View style={[styles.absolute, rect(config.pages.TECHNICAL.bodyRect, size)]}>{page.sections.length ? <View style={styles.technicalGrid}>{page.sections.map((section, index) => <View key={`${section.title}-${index}`} style={[styles.technicalCell, { borderColor: config.brand.primary }]}><View style={[styles.technicalBand, { backgroundColor: config.brand.primary }]}><Text style={styles.technicalTitle}>{section.title}</Text></View><View style={styles.technicalBody}><Text style={styles.technicalComment}>{section.commentary || "Bez komentáře."}</Text></View></View>)}</View> : <View style={styles.empty}><Text>Technické oblasti nebyly doplněny.</Text></View>}</View></ContentFrame>;
}

function Valuation({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "VALUATION" }> }) {
  const config = model.template.config, size = pageSize(config), widths = ["28%", "18%", "14%", "14%", "26%"] as const;
  const cells = (values: string[], header = false) => values.map((value, index) => <Text key={index} style={[styles.cell, { width: widths[index] }, header ? styles.th : {}]}>{value}</Text>);
  return <ContentFrame model={model} assets={assets} role="VALUATION"><View style={[styles.absolute, rect(config.pages.VALUATION.bodyRect, size)]}><View style={[styles.table, { borderColor: config.brand.border }]}><View style={[styles.row, { backgroundColor: config.brand.primary, borderBottomColor: config.brand.border }]}>{cells(["Jednotka / položka", "Dispozice", "Podlaží", "Plocha m²", "Ocenění"], true)}</View>{page.rows.map((row, index) => <View key={index} style={[styles.row, { borderBottomColor: config.brand.border }]}>{"kind" in row ? cells([row.unitLabel, row.disposition || "—", row.floor || "—", number(row.areaM2), money(row.amountCents)]) : cells([row.label, "Starší formát", "—", "—", row.amountCents != null ? money(row.amountCents) : row.valueLabel || "—"])}</View>)}{!page.rows.length && <View style={styles.row}>{cells(["Ocenění nebylo doplněno.", "", "", "", ""])}</View>}</View>{page.final && <View style={[styles.total, { borderColor: config.brand.primary }]}><Text>Celková hodnota</Text><Text>{money(model.valuationTotalCents)}</Text></View>}</View></ContentFrame>;
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
  const config = model.template.config, size = pageSize(config);
  return <ContentFrame model={model} assets={assets} role="TRENDS"><View style={[styles.absolute, rect(config.pages.TRENDS.bodyRect, size)]}>{model.trends.length ? <View style={styles.charts}><MiniChart title="Obsazenost" points={model.trends} field="occupancyPercent" color={config.brand.primary}/><MiniChart title="Měsíční čisté nájemné" points={model.trends} field="monthlyNetRentCents" color={config.brand.primary}/><MiniChart title="Úspěšnost inkasa" points={model.trends} field="collectionRatePercent" color={config.brand.primary}/><MiniChart title="Dluh po splatnosti" points={model.trends} field="overdueDebtCents" color={config.brand.primary}/></View> : <View style={styles.empty}><Text>Historická data zatím nejsou dostupná.</Text></View>}</View></ContentFrame>;
}

function Additional({ model, assets, page }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets; page: Extract<QuarterlyPropertyPdfPage, { kind: "ADDITIONAL_COMMENTARY" }> }) {
  const config = model.template.config;
  return <ContentFrame model={model} assets={assets} role="TRENDS" forceGenerated><View style={[styles.absolute, rect(config.pages.TRENDS.bodyRect, pageSize(config))]}><PageTitle title="Doplňující komentář" continuation={page.continuation}/><Text style={styles.bodyText}>{page.content}</Text></View></ContentFrame>;
}

export function QuarterlyPropertyLandscapePdfDocument({ model, assets }: { model: QuarterlyPropertyPresentation; assets: QuarterlyPropertyPdfAssets }) {
  const plan = buildQuarterlyPropertyPdfPagePlan(model);
  return <Document title={`Kvartální report ${model.property.name} ${reportPeriodLabel(model.report.quarter, model.report.year)}`} author="FlatCloud" creator="FlatCloud property preview">
    {plan.map((page, index) => page.kind === "COVER" ? <Cover key={index} model={model} assets={assets}/> : page.kind === "OVERVIEW" ? <Overview key={index} model={model} assets={assets} page={page}/> : page.kind === "TECHNICAL" ? <Technical key={index} model={model} assets={assets} page={page}/> : page.kind === "VALUATION" ? <Valuation key={index} model={model} assets={assets} page={page}/> : page.kind === "TRENDS" ? <Trends key={index} model={model} assets={assets}/> : <Additional key={index} model={model} assets={assets} page={page}/>) }
  </Document>;
}

export async function renderQuarterlyPropertyLandscapePdf(model: QuarterlyPropertyPresentation, assets: QuarterlyPropertyPdfAssets) {
  const rendered = new Uint8Array(await renderToBuffer(<QuarterlyPropertyLandscapePdfDocument model={model} assets={assets}/>));
  const plan = buildQuarterlyPropertyPdfPagePlan(model);
  const source = await StampDocument.load(rendered);
  const stamped = await StampDocument.create();
  stamped.registerFontkit(fontkit);
  stamped.setTitle(`Kvartální report ${model.property.name} ${reportPeriodLabel(model.report.quarter, model.report.year)}`);
  stamped.setAuthor("FlatCloud");
  stamped.setCreator("FlatCloud property preview");
  const header = await stamped.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "flatcloud-quarterly-page-header.png")));
  const logoSource = assets.contentLogo || assets.logo;
  const logoBytes = logoSource.startsWith("data:") ? Buffer.from(logoSource.split(",", 2)[1], "base64") : fs.readFileSync(logoSource);
  const logo = await stamped.embedPng(logoBytes);
  const utility = await stamped.embedFont(StandardFonts.Helvetica);
  const heading = await stamped.embedFont(fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Raleway-Bold.ttf")), { subset: false });
  const config = model.template.config;
  const white = rgb(1, 1, 1);
  const roleFor = (page: QuarterlyPropertyPdfPage): Exclude<ReportDesignPageRole, "COVER"> | null => page.kind === "COVER" ? null : page.kind === "ADDITIONAL_COMMENTARY" ? "TRENDS" : page.kind;
  for (let index = 0; index < plan.length; index += 1) {
    const sourcePage = source.getPage(index);
    const { width, height } = sourcePage.getSize();
    const page = stamped.addPage([width, height]);
    const role = roleFor(plan[index]);
    if (!role) {
      const coverPage = await stamped.embedPage(sourcePage);
      page.drawPage(coverPage, { x: 0, y: 0, width, height });
      continue;
    }
    const headerHeight = height * config.contentHeader.height;
    const bodyPage = await stamped.embedPage(sourcePage, { left: 0, bottom: 0, right: width, top: height - headerHeight });
    page.drawPage(bodyPage, { x: 0, y: 0, width, height: height - headerHeight });
    const generated = plan[index]?.kind === "ADDITIONAL_COMMENTARY" || model.template.backgrounds[role].mode === "GENERATED";
    if (generated) page.drawImage(header, { x: 0, y: height - headerHeight, width, height: headerHeight });
    else {
      const assetHeader = await stamped.embedPage(sourcePage, { left: 0, bottom: height - headerHeight, right: width, top: height });
      page.drawPage(assetHeader, { x: 0, y: height - headerHeight, width, height: headerHeight });
    }
    const label = config.contentHeader.reportLabelRect;
    page.drawText(reportMasterLabel(model.report.quarter, model.report.year), { x: label.x * width, y: height - label.y * height - 18, size: 18, font: utility, color: white });
    const title = config.contentHeader.propertyTitleRect;
    page.drawText(model.property.name, { x: title.x * width, y: height - title.y * height - 28, size: 28, font: heading, color: white });
    const logoRect = contentLogoRect(config.contentHeader.logoRect);
    page.drawImage(logo, { x: logoRect.x * width, y: height - (logoRect.y + logoRect.height) * height, width: logoRect.width * width, height: logoRect.height * height });
  }
  return new Uint8Array(await stamped.save({ useObjectStreams: false }));
}
