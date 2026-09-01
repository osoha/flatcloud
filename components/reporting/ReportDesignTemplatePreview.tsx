import type { ReportDesignTemplateConfig } from "@/lib/reporting/design-template-schema";
import { ReportDesignGeneratedBackground } from "@/components/reporting/ReportDesignGeneratedBackground";

const pct = (value: number) => `${value * 100}%`;
const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({ left: pct(rect.x), top: pct(rect.y), width: pct(rect.width), height: pct(rect.height) });

export function ReportDesignCoverPreview({ config }: { config: ReportDesignTemplateConfig }) {
  return <div className="design-preview design-cover" style={{ background: config.brand.primary }}><div className="design-hero-placeholder" style={rectStyle(config.cover.imageRect)}><span>MAIN · PRIMARY / 0</span></div><div className="design-logo" style={rectStyle(config.cover.logoRect)}><img src="/flatcloud-logo-white.png" alt="FlatCloud"/></div><strong className="design-cover-title" style={rectStyle(config.cover.titleRect)}>Název nemovitosti</strong><span className="design-cover-period" style={rectStyle(config.cover.periodRect)}>Kvartální report · Q3 2026</span></div>;
}

export function ReportDesignContentPreview({ config, backgroundUrl, overview = false }: { config: ReportDesignTemplateConfig; backgroundUrl?: string; overview?: boolean }) {
  return <div className="design-preview design-content" style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!backgroundUrl && <ReportDesignGeneratedBackground config={config} className="design-generated-background"/>}<span className="design-report-label" style={rectStyle(config.contentHeader.reportLabelRect)}>Kvartální report · Q3 2026</span><strong className="design-property-title" style={rectStyle(config.contentHeader.propertyTitleRect)}>Název nemovitosti</strong><div className="design-logo content-logo" style={rectStyle(config.contentHeader.logoRect)}><img src="/flatcloud-logo-white.png" alt="FlatCloud"/></div><div className="design-safe-area" style={rectStyle(config.contentSafeArea)}>{overview ? <><div className="design-supportive" style={rectStyle({ x: 0, y: 0, width: 0.59, height: 0.92 })}>SUPPORTIVE<br/>SECONDARY / 0</div><div className="design-commentary" style={rectStyle({ x: 0.64, y: 0.04, width: 0.35, height: 0.82 })}><strong>KOMENTÁŘ</strong><span>Management commentary</span></div></> : <span>Bezpečná obsahová plocha</span>}</div></div>;
}
