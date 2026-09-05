import type { ReportDesignTemplateConfig } from "../design-template-schema";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export function scaleRect(rect: NormalizedRect, scaleX: number, scaleY = scaleX): NormalizedRect {
  const width = rect.width * scaleX, height = rect.height * scaleY;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

export function contentLogoRect(rect: NormalizedRect) { return scaleRect(rect, 0.8, 0.78); }

export function coverNarrativeRect(title: ReportDesignTemplateConfig["cover"]["titleRect"]): NormalizedRect {
  return { ...title, height: Math.min(0.42, 0.88 - title.y) };
}

export const reportPeriodLabel = (quarter: number, year: number) => `Q${quarter} ${year}`;
export const reportMasterLabel = (quarter: number, year: number) => `FlatCloud | Kvartální report | ${reportPeriodLabel(quarter, year)}`;

const reportDesignParity = { contentLogoRect, coverNarrativeRect, reportMasterLabel, reportPeriodLabel };
export default reportDesignParity;
