import { z } from "zod";

const normalized = z.number().min(0).max(1);
const rect = z.object({ x: normalized, y: normalized, width: normalized.positive(), height: normalized.positive() }).refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1, "Normalized rectangle exceeds the page.");
const point = z.tuple([normalized, normalized]);
const color = z.string().regex(/^#[0-9A-F]{6}$/i);
const contentPage = z.object({ bodyRect: rect }).strict();

export const reportDesignTemplateConfigSchema = z.object({
  schemaVersion: z.literal(1),
  page: z.object({ format: z.literal("A4"), orientation: z.literal("LANDSCAPE") }).strict(),
  brand: z.object({ primary: color, primaryDark: color, primaryLight: color, text: color, muted: color, border: color, white: color }).strict(),
  typography: z.object({ display: z.literal("Raleway"), heading: z.literal("Raleway"), body: z.literal("Raleway"), utility: z.literal("Arial") }).strict(),
  cover: z.object({ preset: z.literal("FLATCLOUD_SPLIT_HERO"), imageRect: rect, brandRect: rect, logoRect: rect, titleRect: rect, periodRect: rect }).strict(),
  contentHeader: z.object({ preset: z.literal("FLATCLOUD_DIAGONAL_HEADER"), height: normalized, darkPolygon: z.array(point).min(3).max(8), lightPolygon: z.array(point).min(3).max(8), reportLabelRect: rect, propertyTitleRect: rect, logoRect: rect }).strict(),
  contentSafeArea: rect,
  footer: rect,
  mediaSlots: z.object({
    main: z.object({ role: z.literal("PRIMARY"), sortOrder: z.literal(0), fit: z.literal("COVER"), focalPoint: z.literal("CENTER") }).strict(),
    supportive: z.object({ role: z.literal("SECONDARY"), sortOrder: z.literal(0), fit: z.literal("COVER"), treatment: z.enum(["AS_PROVIDED", "BLUE_VEIL"]), blueVeilOpacity: z.number().min(0).max(0.4) }).strict(),
  }).strict(),
  pages: z.object({
    OVERVIEW: z.object({ supportiveImageRect: rect, commentaryRect: rect }).strict(),
    TECHNICAL: contentPage,
    VALUATION: contentPage,
    TRENDS: contentPage,
  }).strict(),
}).strict();

export type ReportDesignTemplateConfig = z.infer<typeof reportDesignTemplateConfigSchema>;
export const REPORT_DESIGN_PAGE_ROLES = ["COVER", "OVERVIEW", "TECHNICAL", "VALUATION", "TRENDS"] as const;
export const SYSTEM_REPORT_DESIGN_TEMPLATE_CODE = "FLATCLOUD_QUARTERLY_2026";

export const flatCloudQuarterly2026Config: ReportDesignTemplateConfig = reportDesignTemplateConfigSchema.parse({
  schemaVersion: 1,
  page: { format: "A4", orientation: "LANDSCAPE" },
  brand: { primary: "#26639F", primaryDark: "#1E4F80", primaryLight: "#DDEAF5", text: "#1F2937", muted: "#7A7A7A", border: "#D7E1EA", white: "#FFFFFF" },
  typography: { display: "Raleway", heading: "Raleway", body: "Raleway", utility: "Arial" },
  cover: { preset: "FLATCLOUD_SPLIT_HERO", imageRect: { x: 0, y: 0, width: 0.472, height: 1 }, brandRect: { x: 0.472, y: 0, width: 0.528, height: 1 }, logoRect: { x: 0.715, y: 0.08, width: 0.225, height: 0.12 }, titleRect: { x: 0.53, y: 0.38, width: 0.4, height: 0.12 }, periodRect: { x: 0.53, y: 0.46, width: 0.35, height: 0.08 } },
  contentHeader: { preset: "FLATCLOUD_DIAGONAL_HEADER", height: 0.255, darkPolygon: [[0, 0], [0.79, 0], [0.67, 0.255], [0, 0.255]], lightPolygon: [[0.72, 0], [1, 0], [1, 0.255], [0.67, 0.255]], reportLabelRect: { x: 0.035, y: 0.04, width: 0.45, height: 0.04 }, propertyTitleRect: { x: 0.035, y: 0.085, width: 0.58, height: 0.08 }, logoRect: { x: 0.715, y: 0.03, width: 0.225, height: 0.1 } },
  contentSafeArea: { x: 0.06, y: 0.31, width: 0.88, height: 0.6 }, footer: { x: 0.035, y: 0.945, width: 0.93, height: 0.03 },
  mediaSlots: { main: { role: "PRIMARY", sortOrder: 0, fit: "COVER", focalPoint: "CENTER" }, supportive: { role: "SECONDARY", sortOrder: 0, fit: "COVER", treatment: "AS_PROVIDED", blueVeilOpacity: 0.16 } },
  pages: { OVERVIEW: { supportiveImageRect: { x: 0.06, y: 0.31, width: 0.52, height: 0.55 }, commentaryRect: { x: 0.625, y: 0.34, width: 0.31, height: 0.5 } }, TECHNICAL: { bodyRect: { x: 0.06, y: 0.31, width: 0.88, height: 0.58 } }, VALUATION: { bodyRect: { x: 0.06, y: 0.31, width: 0.88, height: 0.58 } }, TRENDS: { bodyRect: { x: 0.06, y: 0.31, width: 0.88, height: 0.58 } } },
});
