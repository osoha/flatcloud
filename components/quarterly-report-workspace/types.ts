import type { ReportingQualityIssue } from "@/lib/reporting/data-quality";
import type { QuarterSnapshotData } from "@/lib/reporting/snapshot-schema";
import type { TechnicalSection, ValuationRow } from "@/lib/reporting/editorial-schema";

export type QuarterlyCompletionState = "required-incomplete" | "editorial-sparse" | "complete";

export type QuarterlyPropertyNavItem = {
  propertyId: string;
  propertyName: string;
  completion: QuarterlyCompletionState;
  warningCount: number;
  blockerCount: number;
};

export type QuarterlySnapshotView = {
  id: string;
  revision: number;
  source: string;
  schemaVersion: number;
  calculatorVersion: string;
  createdAt: Date;
  sourceNote: string | null;
  quality: unknown;
  data: QuarterSnapshotData | null;
};

export type QuarterlySnapshotCandidate = Omit<QuarterlySnapshotView, "data"> & { propertyId: string };

export type QuarterlyPropertyWorkspaceData = {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyStatus: string | null;
  managementCommentary: string | null;
  additionalCommentary: string | null;
  technicalSections: TechnicalSection[] | null;
  valuationRows: ValuationRow[] | null;
  primaryPhoto: { id: string; caption: string | null; sourceDocumentId: string | null } | null;
  supportivePhoto: { id: string; caption: string | null; sourceDocumentId: string | null } | null;
  snapshot: QuarterlySnapshotView;
};

export type QuarterlyPropertyPhotoCandidate = {
  id: string;
  title: string;
  description: string | null;
  photoStage: string | null;
  documentDate: Date | null;
  createdAt: Date;
  fileAsset: { id: string; mimeType: string; sizeBytes: number };
};

export type QuarterlyQualityGateView = {
  issues: ReportingQualityIssue[];
  infoCount: number;
  warningCount: number;
  blockerCount: number;
  invalidQualityCount: number;
};
