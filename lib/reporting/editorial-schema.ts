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

export const valuationRowSchema = z.object({
  label: z.string().min(1).max(120),
  amountCents: z.number().int().nullable().optional(),
  valueLabel: optionalText(120).optional(),
  note: optionalText(500).optional(),
}).strict().superRefine((row, context) => {
  if (row.amountCents == null && !row.valueLabel?.trim()) context.addIssue({ code: "custom", message: "Valuation row requires an amount or value label." });
});

export const valuationRowsSchema = z.array(valuationRowSchema).max(40);

export const valuationRowEditorSchema = z.object({
  label: z.string(),
  amountCzk: z.string(),
  valueLabel: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).strict();
export const valuationRowsEditorSchema = z.array(valuationRowEditorSchema).max(40);

export const quarterlyReportEditorialSchema = z.object({ executiveSummary: optionalText(10000) }).strict();
export const quarterlyPropertyReportContentSchema = z.object({
  propertyStatus: z.enum(propertyReportingStatuses).nullable(),
  managementCommentary: optionalText(10000),
  technicalSections: technicalSectionsSchema,
  valuationRows: valuationRowsSchema,
}).strict();

export type TechnicalSection = z.output<typeof technicalSectionSchema>;
export type ValuationRow = z.output<typeof valuationRowSchema>;
export type QuarterlyReportEditorialInput = z.input<typeof quarterlyReportEditorialSchema>;
export type QuarterlyPropertyReportContentInput = z.input<typeof quarterlyPropertyReportContentSchema>;
