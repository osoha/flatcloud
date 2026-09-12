import { z } from "zod";

const normalized = z.number().min(0).max(1);
const rect = z.object({ x: normalized, y: normalized, width: normalized.positive(), height: normalized.positive() }).refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1, "Normalized rectangle exceeds the page.");
const point = z.tuple([normalized, normalized]);
const color = z.string().regex(/^#[0-9A-F]{6}$/i);
const contentPage = z.object({ bodyRect: rect }).strict();

export const reportDesignTemplateConfigSchema = z.object({
  schemaVersion: z.literal(1),
  page: z.object({ format: z.enum(["A4", "FLATCLOUD_13X9"]), orientation: z.literal("LANDSCAPE") }).strict(),
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
  page: { format: "FLATCLOUD_13X9", orientation: "LANDSCAPE" },
  brand: { primary: "#26639F", primaryDark: "#26639F", primaryLight: "#CADDF2", text: "#1F2937", muted: "#7A7A7A", border: "#CADDF2", white: "#FFFFFF" },
  typography: { display: "Raleway", heading: "Raleway", body: "Raleway", utility: "Arial" },
  cover: { preset: "FLATCLOUD_SPLIT_HERO", imageRect: { x: 0, y: 0, width: 0.472, height: 1 }, brandRect: { x: 0.472, y: 0, width: 0.528, height: 1 }, logoRect: { x: 0.715, y: 0.08, width: 0.228, height: 0.059 }, titleRect: { x: 0.528, y: 0.381, width: 0.402, height: 0.07 }, periodRect: { x: 0.528, y: 0.459, width: 0.402, height: 0.032 } },
  contentHeader: { preset: "FLATCLOUD_DIAGONAL_HEADER", height: 0.256, darkPolygon: [[0, 0], [0.655, 0], [0.635, 0.183], [0, 0.256]], lightPolygon: [[0.655, 0], [1, 0], [1, 0.139], [0.635, 0.183]], reportLabelRect: { x: 0.035, y: 0.045, width: 0.5, height: 0.024 }, propertyTitleRect: { x: 0.035, y: 0.084, width: 0.585, height: 0.078 }, logoRect: { x: 0.714, y: 0.028, width: 0.225, height: 0.058 } },
  contentSafeArea: { x: 0.06, y: 0.296, width: 0.88, height: 0.6 }, footer: { x: 0.018, y: 0.936, width: 0.964, height: 0.022 },
  mediaSlots: { main: { role: "PRIMARY", sortOrder: 0, fit: "COVER", focalPoint: "CENTER" }, supportive: { role: "SECONDARY", sortOrder: 0, fit: "COVER", treatment: "AS_PROVIDED", blueVeilOpacity: 0.16 } },
  pages: { OVERVIEW: { supportiveImageRect: { x: 0.06, y: 0.308, width: 0.522, height: 0.549 }, commentaryRect: { x: 0.626, y: 0.344, width: 0.313, height: 0.5 } }, TECHNICAL: { bodyRect: { x: 0.041, y: 0.296, width: 0.91, height: 0.508 } }, VALUATION: { bodyRect: { x: 0.041, y: 0.292, width: 0.91, height: 0.61 } }, TRENDS: { bodyRect: { x: 0.034, y: 0.292, width: 0.932, height: 0.592 } } },
});
