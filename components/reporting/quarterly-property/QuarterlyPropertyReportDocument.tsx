import type { CSSProperties, ReactNode } from "react";
import type { ReportDesignPageRole } from "@prisma/client";
import type { ReportDesignTemplateConfig } from "@/lib/reporting/design-template-schema";
import type { QuarterlyPropertyPresentation, PresentationTrendPoint } from "@/lib/reporting/presentation/quarterly-property-presentation-model";

const pct = (value: number) => `${value * 100}%`;
const rect = (value: { x: number; y: number; width: number; height: number }): CSSProperties => ({ left: pct(value.x), top: pct(value.y), width: pct(value.width), height: pct(value.height) });
const polygon = (points: Array<[number, number]>) => `polygon(${points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(",")})`;
const money = (cents: number | null) => cents == null ? "—" : `${(cents / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const statusLabels: Record<string, string> = { STABILIZED: "Stabilizovaná", RENOVATION: "Rekonstrukce", DEVELOPMENT: "Development", EXIT: "Exit / prodej" };
const technicalLabels: Record<string, string> = { OK: "V pořádku", WATCH: "Sledovat", ACTION: "Vyžaduje akci", RISK: "Riziko" };
function splitText(value: string, limit: number) {
  const words = value.trim().split(/\s+/).filter(Boolean), chunks: string[] = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (current && next.length > limit) { chunks.push(current); current = word; } else current = next; }
  if (current) chunks.push(current); return chunks.length ? chunks : [""];
}

function GeneratedBackground({ config }: { config: ReportDesignTemplateConfig }) {
  return <><div className="qpr-generated-dark" style={{ background: config.brand.primaryDark, clipPath: polygon(config.contentHeader.darkPolygon) }}/><div className="qpr-generated-light" style={{ background: config.brand.primaryLight, clipPath: polygon(config.contentHeader.lightPolygon) }}/></>;
}

function Page({ model, role, title, continuation, children }: { model: QuarterlyPropertyPresentation; role: ReportDesignPageRole; title?: string; continuation?: number; children: ReactNode }) {
  const { config, backgrounds } = model.template, background = backgrounds[role];
  return <section className={`qpr-page qpr-page-${role.toLowerCase()}`} style={{ "--qpr-primary": config.brand.primary, "--qpr-dark": config.brand.primaryDark, "--qpr-light": config.brand.primaryLight, "--qpr-text": config.brand.text, "--qpr-muted": config.brand.muted, "--qpr-border": config.brand.border, "--qpr-white": config.brand.white, fontFamily: `${config.typography.body}, Arial, sans-serif` } as CSSProperties} data-page-role={role} data-background-mode={background.mode}>
    {background.mode === "ASSET" && background.imageUrl ? <img className="qpr-background-asset" src={background.imageUrl} alt=""/> : role !== "COVER" && <GeneratedBackground config={config}/>}
    {role !== "COVER" && <><span className="qpr-report-label" style={rect(config.contentHeader.reportLabelRect)}>Kvartální report · Q{model.report.quarter} {model.report.year}</span><strong className="qpr-property-title" style={rect(config.contentHeader.propertyTitleRect)}>{model.property.name}</strong><span className="qpr-logo qpr-content-logo" style={rect(config.contentHeader.logoRect)}>FLATCLOUD</span></>}
    {title && <h2 className="qpr-section-title">{title}{continuation && continuation > 1 ? ` · pokračování ${continuation}` : ""}</h2>}
    {children}<footer className="qpr-footer" style={rect(config.footer)}><span>{model.property.name}</span><span>{role}</span></footer>
  </section>;
}

function Cover({ model }: { model: QuarterlyPropertyPresentation }) {
  const config = model.template.config;
  return <Page model={model} role="COVER"><div className="qpr-cover-brand" style={{ ...rect(config.cover.brandRect), background: config.brand.primary }}/>{model.media.primary ? <img className="qpr-cover-photo" style={rect(config.cover.imageRect)} src={model.media.primary.imageUrl} alt={model.media.primary.caption || model.property.name}/> : <div className="qpr-photo-placeholder qpr-cover-photo" style={rect(config.cover.imageRect)}>Fotografie nebyla vybrána</div>}<span className="qpr-logo qpr-cover-logo" style={rect(config.cover.logoRect)}>FLATCLOUD</span><div className="qpr-cover-title" style={rect(config.cover.titleRect)}><h1>{model.property.name}</h1><p>{model.property.address}</p></div><span className="qpr-cover-period" style={rect(config.cover.periodRect)}>Kvartální report · Q{model.report.quarter} {model.report.year}</span></Page>;
}

function Overview({ model }: { model: QuarterlyPropertyPresentation }) {
  const config = model.template.config, imageRect = config.pages.OVERVIEW.supportiveImageRect, commentaryRect = config.pages.OVERVIEW.commentaryRect;
  const commentary = splitText(model.managementCommentary?.trim() || "Komentář nebyl doplněn.", 900);
  return <>{commentary.map((text, index) => <Page key={index} model={model} role="OVERVIEW"><div className="qpr-overview-photo-wrap" style={rect(imageRect)}>{model.media.supportive ? <><img src={model.media.supportive.imageUrl} alt={model.media.supportive.caption || "Doplňková fotografie"}/>{config.mediaSlots.supportive.treatment === "BLUE_VEIL" && <i style={{ background: config.brand.primary, opacity: config.mediaSlots.supportive.blueVeilOpacity }}/>} {model.media.supportive.caption && <small>{model.media.supportive.caption}</small>}</> : <div className="qpr-photo-placeholder">Doplňková fotografie nebyla vybrána</div>}</div><div className="qpr-commentary" style={rect(commentaryRect)}><span className="qpr-kicker">{model.property.status ? statusLabels[model.property.status] || model.property.status : "Kvartální přehled"}</span><h2>Komentář managementu{index ? ` · pokračování ${index + 1}` : ""}</h2><p>{text}</p></div></Page>)}</>;
}

function Technical({ model }: { model: QuarterlyPropertyPresentation }) {
  const expanded = model.technicalSections.flatMap((section) => splitText(section.commentary, 550).map((commentary, index) => ({ ...section, title: index ? `${section.title} · pokračování ${index + 1}` : section.title, commentary })));
  const chunks = expanded.length ? Array.from({ length: Math.ceil(expanded.length / 6) }, (_, index) => expanded.slice(index * 6, index * 6 + 6)) : [[]];
  return <>{chunks.map((sections, page) => <Page key={page} model={model} role="TECHNICAL" title="Technický stav" continuation={page + 1}><div className="qpr-body qpr-technical-grid" style={rect(model.template.config.pages.TECHNICAL.bodyRect)}>{sections.length ? sections.map((section, index) => <article className={`qpr-technical-card status-${section.status || "NONE"}`} key={index}><header><h3>{section.title}</h3>{section.status && <span>{technicalLabels[section.status]}</span>}</header><p>{section.commentary || "Bez komentáře."}</p></article>) : <div className="qpr-empty">Technické oblasti nebyly doplněny.</div>}</div></Page>)}</>;
}

function Valuation({ model }: { model: QuarterlyPropertyPresentation }) {
  const chunks = model.valuationRows.length ? Array.from({ length: Math.ceil(model.valuationRows.length / 12) }, (_, index) => model.valuationRows.slice(index * 12, index * 12 + 12)) : [[]];
  return <>{chunks.map((rows, page) => <Page key={page} model={model} role="VALUATION" title="Ocenění" continuation={page + 1}><div className="qpr-body qpr-valuation" style={rect(model.template.config.pages.VALUATION.bodyRect)}>{rows.length ? <table><thead><tr><th>Jednotka / položka</th><th>Dispozice</th><th>Podlaží</th><th>Plocha m²</th><th>Ocenění</th></tr></thead><tbody>{rows.map((row, index) => "kind" in row ? <tr key={index}><td>{row.unitLabel}</td><td>{row.disposition || "—"}</td><td>{row.floor || "—"}</td><td>{row.areaM2 == null ? "—" : row.areaM2.toLocaleString("cs-CZ")}</td><td>{money(row.amountCents)}</td></tr> : <tr key={index} className="legacy"><td>{row.label}{row.note && <small>{row.note}</small>}</td><td colSpan={3}>{row.valueLabel || "Starší formát ocenění"}</td><td>{money(row.amountCents ?? null)}</td></tr>)}</tbody></table> : <div className="qpr-empty">Ocenění nebylo doplněno.</div>}{page === chunks.length - 1 && <div className="qpr-valuation-total"><span>Celková hodnota</span><strong>{money(model.valuationTotalCents)}</strong></div>}</div></Page>)}</>;
}

function MiniChart({ title, points, field, format }: { title: string; points: PresentationTrendPoint[]; field: keyof Omit<PresentationTrendPoint, "label">; format: (value: number) => string }) {
  const values = points.map((point) => point[field]).filter((value): value is number => typeof value === "number");
  if (!values.length) return <article className="qpr-chart"><h3>{title}</h3><div className="qpr-chart-empty">Pro toto období nejsou dostupná data.</div></article>;
  const max = Math.max(...values), min = Math.min(...values), spread = max - min || Math.max(Math.abs(max), 1);
  const coordinates = points.map((point, index) => { const value = point[field]; return value == null ? null : { x: points.length === 1 ? 50 : 6 + index * 88 / (points.length - 1), y: 84 - (value - min) / spread * 62, value, label: point.label }; });
  const segments: string[] = []; let current: string[] = [];
  for (const point of coordinates) { if (point) current.push(`${point.x},${point.y}`); else if (current.length) { segments.push(current.join(" ")); current = []; } } if (current.length) segments.push(current.join(" "));
  return <article className="qpr-chart"><h3>{title}</h3><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={title}>{[25, 50, 75].map((y) => <line key={y} x1="5" y1={y} x2="95" y2={y}/>)}{segments.map((segment, index) => <polyline key={index} points={segment}/>) }{coordinates.map((point, index) => point && <circle key={index} cx={point.x} cy={point.y} r="1.8"/>)}</svg><div className="qpr-chart-labels">{coordinates.map((point, index) => <span key={index}>{point ? <><small>{point.label}</small><strong>{format(point.value)}</strong></> : <><small>{points[index].label}</small><strong>—</strong></>}</span>)}</div></article>;
}

function Trends({ model }: { model: QuarterlyPropertyPresentation }) {
  const compactMoney = (value: number) => `${(value / 100).toLocaleString("cs-CZ", { notation: "compact", maximumFractionDigits: 1 })} Kč`;
  return <Page model={model} role="TRENDS" title="Vývoj hlavních ukazatelů"><div className="qpr-body qpr-trends-grid" style={rect(model.template.config.pages.TRENDS.bodyRect)}>{model.trends.length ? <><MiniChart title="Obsazenost" points={model.trends} field="occupancyPercent" format={(value) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`}/><MiniChart title="Měsíční čisté nájemné" points={model.trends} field="monthlyNetRentCents" format={compactMoney}/><MiniChart title="Úspěšnost inkasa" points={model.trends} field="collectionRatePercent" format={(value) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`}/><MiniChart title="Dluh po splatnosti" points={model.trends} field="overdueDebtCents" format={compactMoney}/></> : <div className="qpr-empty qpr-trends-empty">Historická data zatím nejsou dostupná.</div>}</div></Page>;
}

export function QuarterlyPropertyReportDocument({ model }: { model: QuarterlyPropertyPresentation }) { return <div className="qpr-document"><Cover model={model}/><Overview model={model}/><Technical model={model}/><Valuation model={model}/><Trends model={model}/></div>; }
