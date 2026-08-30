import { quarterSnapshotQualitySchema } from "./snapshot-schema";
import type { ReportingQualityIssue } from "./data-quality";

export type QuarterlyQualitySnapshot = {
  propertyId: string;
  quality: unknown;
};

export type QuarterlyReportQualityGate = {
  issues: ReportingQualityIssue[];
  infoCount: number;
  warningCount: number;
  blockerCount: number;
  invalidQualityCount: number;
};

export function quarterlyReportQualityGate(
  rows: QuarterlyQualitySnapshot[],
): QuarterlyReportQualityGate {
  const issues: ReportingQualityIssue[] = [];
  let invalidQualityCount = 0;

  for (const row of rows) {
    const parsed = quarterSnapshotQualitySchema.safeParse(row.quality);

    if (!parsed.success) {
      invalidQualityCount += 1;
      continue;
    }

    for (const issue of parsed.data.issues) {
      issues.push(
        issue.propertyId ? issue : { ...issue, propertyId: row.propertyId },
      );
    }
  }

  return {
    issues,
    infoCount: issues.filter((issue) => issue.severity === "INFO").length,
    warningCount: issues.filter((issue) => issue.severity === "WARNING").length,
    blockerCount:
      issues.filter((issue) => issue.severity === "BLOCKER").length +
      invalidQualityCount,
    invalidQualityCount,
  };
}
