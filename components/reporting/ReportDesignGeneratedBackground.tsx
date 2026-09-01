import type { ReportDesignTemplateConfig } from "@/lib/reporting/design-template-schema";

const points = (value: Array<[number, number]>) => value.map(([x, y]) => `${x},${y}`).join(" ");

export function ReportDesignGeneratedBackground({ config, className = "qpr-generated-background" }: { config: ReportDesignTemplateConfig; className?: string }) {
  return <svg className={className} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <polygon className="generated-dark-polygon" points={points(config.contentHeader.darkPolygon)} fill={config.brand.primaryDark}/>
    <polygon className="generated-light-polygon" points={points(config.contentHeader.lightPolygon)} fill={config.brand.primaryLight}/>
  </svg>;
}
