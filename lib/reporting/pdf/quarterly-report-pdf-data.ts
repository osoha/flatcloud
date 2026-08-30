import { prisma } from "../../db";
import { reportingQualityCopy, type ReportingQualityIssue } from "../data-quality";
import { quarterlyPropertyReportContentSchema, type TechnicalSection, type ValuationRow } from "../editorial-schema";
import { quarterSnapshotDataSchema, quarterSnapshotQualitySchema, type QuarterSnapshotData } from "../snapshot-schema";

export type FrozenQuarterlyReportPdfProperty = {
  propertyName: string;
  propertyAddress: string;
  propertyStatus: "STABILIZED" | "RENOVATION" | "DEVELOPMENT" | "EXIT" | null;
  managementCommentary: string | null;
  technicalSections: TechnicalSection[];
  valuationRows: ValuationRow[];
  snapshot: {
    source: "CALCULATED" | "MANUAL_BASELINE";
    schemaVersion: number;
    calculatorVersion: string;
    sourceNote: string | null;
    data: QuarterSnapshotData;
    quality: { issues: Array<Pick<ReportingQualityIssue, "code" | "severity"> & { label: string }> };
  };
};

export type FrozenQuarterlyReportPdfData = {
  reportingGroupName: string;
  year: number;
  quarter: number;
  revision: number;
  asOfDate: Date;
  publishedAt: Date;
  executiveSummary: string | null;
  properties: FrozenQuarterlyReportPdfProperty[];
};

/** Loads only frozen reporting rows and immutable linked snapshots. */
export async function loadFrozenQuarterlyReportPdfData(reportId: string, reportingGroupId: string): Promise<FrozenQuarterlyReportPdfData> {
  const report = await prisma.quarterlyReport.findFirst({
    where: { id: reportId, reportingGroupId, status: "PUBLISHED" },
    select: {
      reportingGroupNameSnapshot: true, year: true, quarter: true, revision: true, asOfDate: true, publishedAt: true, executiveSummary: true,
      propertyReports: {
        select: {
          propertyNameSnapshot: true, propertyAddressSnapshot: true, propertyStatus: true, managementCommentary: true, technicalSections: true, valuationRows: true,
          snapshot: { select: { source: true, schemaVersion: true, calculatorVersion: true, sourceNote: true, data: true, quality: true } },
        },
        orderBy: [{ propertyNameSnapshot: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!report?.publishedAt) throw new Error("Published report PDF data was not found.");
  return {
    reportingGroupName: report.reportingGroupNameSnapshot,
    year: report.year,
    quarter: report.quarter,
    revision: report.revision,
    asOfDate: report.asOfDate,
    publishedAt: report.publishedAt,
    executiveSummary: report.executiveSummary,
    properties: report.propertyReports.map((row) => {
      const editorial = quarterlyPropertyReportContentSchema.parse({ propertyStatus: row.propertyStatus, managementCommentary: row.managementCommentary, technicalSections: row.technicalSections ?? [], valuationRows: row.valuationRows ?? [] });
      const data = quarterSnapshotDataSchema.parse(row.snapshot.data);
      const quality = quarterSnapshotQualitySchema.parse(row.snapshot.quality);
      return {
        propertyName: row.propertyNameSnapshot,
        propertyAddress: row.propertyAddressSnapshot,
        ...editorial,
        snapshot: {
          source: row.snapshot.source,
          schemaVersion: row.snapshot.schemaVersion,
          calculatorVersion: row.snapshot.calculatorVersion,
          sourceNote: row.snapshot.sourceNote,
          data,
          quality: { issues: quality.issues.map(({ code, severity }) => ({ code, severity, label: reportingQualityCopy[code].label })) },
        },
      };
    }),
  };
}
