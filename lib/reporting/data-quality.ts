import { z } from "zod";
export const reportingQualityCodes = ["UNKNOWN_OPERATIONAL_HISTORY", "MISSING_UNIT_AREA", "RENT_SOURCE_LEGACY_FALLBACK", "MISSING_RENT_SOURCE", "MISSING_CHARGE_FOR_PERIOD", "DEPOSIT_CONFIGURATION_WARNING", "NO_RENTABLE_UNITS"] as const;
export const reportingQualityIssueSchema = z.object({ code: z.enum(reportingQualityCodes), severity: z.enum(["INFO", "WARNING", "BLOCKER"]), message: z.string().min(1), propertyId: z.string().optional(), unitId: z.string().optional(), leaseId: z.string().optional() }).strict();
export const reportingQualitySchema = z.object({ issues: z.array(reportingQualityIssueSchema) }).strict();
export type ReportingQualityIssue = z.infer<typeof reportingQualityIssueSchema>;
