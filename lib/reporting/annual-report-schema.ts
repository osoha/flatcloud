import { z } from "zod";

const blankToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const optionalMoney = z.number().int().min(0).nullable();
const optionalCount = z.number().int().min(0).max(2_000_000_000).nullable();

export const annualReportEditorialSchema = z.object({
  founderLetter: optionalText(20_000),
  executiveSummary: optionalText(12_000),
  investmentThesis: optionalText(12_000),
  valueCreationSummary: optionalText(12_000),
  outlook: optionalText(12_000),
  grossAssetValueCents: optionalMoney,
  netAssetValueCents: optionalMoney,
  debtCents: optionalMoney,
  targetPortfolioValueCents: optionalMoney,
  realizedExitProceedsCents: optionalMoney,
  plannedExitProceedsCents: optionalMoney,
  issuedShares: optionalCount,
  treasuryShares: optionalCount,
  sharePriceCents: optionalMoney,
}).strict().superRefine((value, context) => {
  if (value.issuedShares !== null && value.treasuryShares !== null && value.treasuryShares > value.issuedShares) {
    context.addIssue({ code: "custom", path: ["treasuryShares"], message: "Treasury shares cannot exceed issued shares." });
  }
});

export const annualPropertyEditorialSchema = z.object({
  openingValueCents: optionalMoney,
  currentValueCents: optionalMoney,
  targetValueCents: optionalMoney,
  realizedExitProceedsCents: optionalMoney,
  plannedExitProceedsCents: optionalMoney,
  plannedExitYear: z.number().int().min(2000).max(2200).nullable(),
  investmentCase: optionalText(10_000),
  valueCreationNarrative: optionalText(10_000),
  outlook: optionalText(10_000),
  sourceNote: optionalText(2_000),
}).strict();

export type AnnualReportEditorialInput = z.input<typeof annualReportEditorialSchema>;
export type AnnualPropertyEditorialInput = z.input<typeof annualPropertyEditorialSchema>;
