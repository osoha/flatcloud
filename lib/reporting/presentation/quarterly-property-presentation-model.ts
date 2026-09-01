import type { ReportDesignPageRole } from "@prisma/client";
import type { ReportDesignTemplateConfig } from "../design-template-schema";
import type { TechnicalSection, ValuationRow } from "../editorial-schema";

export type PresentationBackground = { role: ReportDesignPageRole; mode: "GENERATED" | "ASSET"; imageUrl: string | null };
export type PresentationMedia = { id: string; caption: string | null; imageUrl: string } | null;
export type PresentationTrendPoint = { label: string; occupancyPercent: number | null; monthlyNetRentCents: number | null; collectionRatePercent: number | null; overdueDebtCents: number | null };

export type QuarterlyPropertyPresentation = {
  report: { id: string; groupId: string; year: number; quarter: number; status: string };
  property: { id: string; name: string; address: string; status: string | null };
  template: { id: string; name: string; version: number; config: ReportDesignTemplateConfig; backgrounds: Record<ReportDesignPageRole, PresentationBackground> };
  media: { primary: PresentationMedia; supportive: PresentationMedia };
  managementCommentary: string | null;
  additionalCommentary: string | null;
  technicalSections: TechnicalSection[];
  valuationRows: ValuationRow[];
  valuationTotalCents: number;
  trends: PresentationTrendPoint[];
};
