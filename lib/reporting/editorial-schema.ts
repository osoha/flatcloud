import { z } from "zod";

const blankToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().max(max).nullable());

export const propertyReportingStatuses = ["STABILIZED", "RENOVATION", "DEVELOPMENT", "EXIT"] as const;
export const technicalSectionStatuses = ["OK", "WATCH", "ACTION", "RISK"] as const;

export const technicalSectionSchema = z.object({
  title: z.string().min(1).max(120),
  status: z.enum(technicalSectionStatuses).optional(),
  commentary: z.string().max(4000),
}).strict();

export const technicalSectionsSchema = z.array(technicalSectionSchema).max(25);

export const legacyValuationRowSchema = z.object({
  label: z.string().min(1).max(120),
  amountCents: z.number().int().nullable().optional(),
  valueLabel: optionalText(120).optional(),
  note: optionalText(500).optional(),
}).strict().superRefine((row, context) => {
  if (row.amountCents == null && !row.valueLabel?.trim()) context.addIssue({ code: "custom", message: "Valuation row requires an amount or value label." });
});

export const unitValuationRowSchema = z.object({
  kind: z.literal("UNIT"),
  unitLabel: z.string().min(1).max(120),
  disposition: optionalText(120),
  floor: optionalText(120),
  areaM2: z.number().positive().nullable(),
  amountCents: z.number().int(),
}).strict();

export const valuationRowSchema = z.union([unitValuationRowSchema, legacyValuationRowSchema]);

export const valuationRowsSchema = z.array(valuationRowSchema).max(40);

export const unitValuationRowEditorSchema = z.object({
  kind: z.literal("UNIT"),
  unitLabel: z.string(),
  disposition: z.string().nullable(),
  floor: z.string().nullable(),
  areaM2: z.string(),
  amountCzk: z.string(),
}).strict();
export const valuationRowEditorSchema = z.union([unitValuationRowEditorSchema, legacyValuationRowSchema]);
export const valuationRowsEditorSchema = z.array(valuationRowEditorSchema).max(40);

export function valuationTotalCents(rows: readonly ValuationRow[]) {
  return rows.reduce((total, row) => total + (typeof row.amountCents === "number" ? row.amountCents : 0), 0);
}

export const quarterlyReportEditorialSchema = z.object({ executiveSummary: optionalText(10000) }).strict();
export const quarterlyPropertyReportContentSchema = z.object({
  propertyStatus: z.enum(propertyReportingStatuses).nullable(),
  managementCommentary: optionalText(10000),
  additionalCommentary: optionalText(10000).optional().default(null),
  technicalSections: technicalSectionsSchema,
  valuationRows: valuationRowsSchema,
}).strict();

export type TechnicalSection = z.output<typeof technicalSectionSchema>;
export type ValuationRow = z.output<typeof valuationRowSchema>;
export type QuarterlyReportEditorialInput = z.input<typeof quarterlyReportEditorialSchema>;
export type QuarterlyPropertyReportContentInput = z.input<typeof quarterlyPropertyReportContentSchema>;
