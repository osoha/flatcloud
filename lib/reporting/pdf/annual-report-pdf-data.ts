import { createHash } from "node:crypto";
import { prisma } from "../../db";
import { imageDataUrl, readAnnualContact, readAnnualGroupStructure, readAnnualTeam, type AnnualContact, type AnnualGroupStructure, type AnnualTeamMember } from "../annual-corporate-sections";

export type FrozenAnnualReportPdfProperty = {
  propertyName: string;
  propertyAddress: string;
  openingValueCents: bigint | null;
  currentValueCents: bigint | null;
  targetValueCents: bigint | null;
  realizedExitProceedsCents: bigint | null;
  plannedExitProceedsCents: bigint | null;
  plannedExitYear: number | null;
  investmentCase: string | null;
  valueCreationNarrative: string | null;
  outlook: string | null;
  sourceNote: string | null;
  mapLatitude: number | null;
  mapLongitude: number | null;
  mapLabel: string | null;
  mapCardSide: string;
  mapPhotoDataUrl: string | null;
  snapshot: {
    revision: number;
    source: "CALCULATED" | "MANUAL_BASELINE";
    schemaVersion: number;
    calculatorVersion: string;
    sourceNote: string | null;
    fingerprint: string;
  };
};

export type FrozenAnnualReportPdfData = {
  reportingGroupName: string;
  year: number;
  revision: number;
  asOfDate: Date;
  founderLetter: string | null;
  executiveSummary: string | null;
  investmentThesis: string | null;
  valueCreationSummary: string | null;
  outlook: string | null;
  grossAssetValueCents: bigint | null;
  netAssetValueCents: bigint | null;
  debtCents: bigint | null;
  targetPortfolioValueCents: bigint | null;
  realizedExitProceedsCents: bigint | null;
  plannedExitProceedsCents: bigint | null;
  issuedShares: number | null;
  treasuryShares: number | null;
  sharePriceCents: bigint | null;
  team: AnnualTeamMember[];
  groupStructure: AnnualGroupStructure;
  contact: AnnualContact;
  properties: FrozenAnnualReportPdfProperty[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function loadFrozenAnnualReportPdfData(reportId: string, reportingGroupId: string): Promise<FrozenAnnualReportPdfData> {
  const report = await prisma.annualReport.findFirst({
    where: { id: reportId, reportingGroupId, status: { in: ["DRAFT", "REVIEW", "PUBLISHED"] } },
    select: {
      reportingGroupNameSnapshot: true, year: true, revision: true, asOfDate: true,
      founderLetter: true, executiveSummary: true, investmentThesis: true, valueCreationSummary: true, outlook: true,
      grossAssetValueCents: true, netAssetValueCents: true, debtCents: true, targetPortfolioValueCents: true,
      realizedExitProceedsCents: true, plannedExitProceedsCents: true, issuedShares: true, treasuryShares: true, sharePriceCents: true,
      teamSnapshot: true, groupStructureSnapshot: true, contactSnapshot: true,
      propertyReports: {
        select: {
          propertyNameSnapshot: true, propertyAddressSnapshot: true, openingValueCents: true, currentValueCents: true, targetValueCents: true,
          realizedExitProceedsCents: true, plannedExitProceedsCents: true, plannedExitYear: true, investmentCase: true,
          valueCreationNarrative: true, outlook: true, sourceNote: true, mapLatitude: true, mapLongitude: true, mapLabel: true, mapCardSide: true, mapPhotoData: true, mapPhotoMimeType: true,
          snapshot: { select: { revision: true, source: true, schemaVersion: true, calculatorVersion: true, sourceNote: true, data: true, quality: true } },
        },
        orderBy: [{ propertyNameSnapshot: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!report) throw new Error("Annual report PDF data was not found.");
  return {
    reportingGroupName: report.reportingGroupNameSnapshot,
    year: report.year,
    revision: report.revision,
    asOfDate: report.asOfDate,
    founderLetter: report.founderLetter,
    executiveSummary: report.executiveSummary,
    investmentThesis: report.investmentThesis,
    valueCreationSummary: report.valueCreationSummary,
    outlook: report.outlook,
    grossAssetValueCents: report.grossAssetValueCents,
    netAssetValueCents: report.netAssetValueCents,
    debtCents: report.debtCents,
    targetPortfolioValueCents: report.targetPortfolioValueCents,
    realizedExitProceedsCents: report.realizedExitProceedsCents,
    plannedExitProceedsCents: report.plannedExitProceedsCents,
    issuedShares: report.issuedShares,
    treasuryShares: report.treasuryShares,
    sharePriceCents: report.sharePriceCents,
    team: readAnnualTeam(report.teamSnapshot),
    groupStructure: readAnnualGroupStructure(report.groupStructureSnapshot),
    contact: readAnnualContact(report.contactSnapshot),
    properties: report.propertyReports.map((row) => ({
      propertyName: row.propertyNameSnapshot,
      propertyAddress: row.propertyAddressSnapshot,
      openingValueCents: row.openingValueCents,
      currentValueCents: row.currentValueCents,
      targetValueCents: row.targetValueCents,
      realizedExitProceedsCents: row.realizedExitProceedsCents,
      plannedExitProceedsCents: row.plannedExitProceedsCents,
      plannedExitYear: row.plannedExitYear,
      investmentCase: row.investmentCase,
      valueCreationNarrative: row.valueCreationNarrative,
      outlook: row.outlook,
      sourceNote: row.sourceNote,
      mapLatitude: row.mapLatitude,
      mapLongitude: row.mapLongitude,
      mapLabel: row.mapLabel,
      mapCardSide: row.mapCardSide || "AUTO",
      mapPhotoDataUrl: imageDataUrl(row.mapPhotoData, row.mapPhotoMimeType),
      snapshot: {
        revision: row.snapshot.revision,
        source: row.snapshot.source,
        schemaVersion: row.snapshot.schemaVersion,
        calculatorVersion: row.snapshot.calculatorVersion,
        sourceNote: row.snapshot.sourceNote,
        fingerprint: createHash("sha256").update(stableJson({ data: row.snapshot.data, quality: row.snapshot.quality })).digest("hex"),
      },
    })),
  };
}
