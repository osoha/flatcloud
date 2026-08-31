import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { QuarterlyReportPropertyWorkspace } from "@/components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace";
import { QuarterlyReportQuarterOverview } from "@/components/quarterly-report-workspace/QuarterlyReportQuarterOverview";
import { QuarterlyReportReviewExport } from "@/components/quarterly-report-workspace/QuarterlyReportReviewExport";
import { QuarterlyReportWorkspaceNav } from "@/components/quarterly-report-workspace/QuarterlyReportWorkspaceNav";
import type { QuarterlyCompletionState, QuarterlyPropertyNavItem } from "@/components/quarterly-report-workspace/types";
import { requireUser } from "@/lib/auth";
import { businessDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canAdminReportingBackoffice, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { technicalSectionsSchema, valuationRowsSchema } from "@/lib/reporting/editorial-schema";
import { quarterlyReportQualityGate } from "@/lib/reporting/quarterly-quality-gate";
import { quarterSnapshotDataSchema, quarterSnapshotQualitySchema } from "@/lib/reporting/snapshot-schema";
import { fileStorageCapabilities } from "@/lib/storage";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };

function completionState(propertyStatus: string | null, managementCommentary: string | null, technicalCount: number, valuationCount: number): QuarterlyCompletionState {
  if (!propertyStatus) return "required-incomplete";
  if (!managementCommentary?.trim() || technicalCount === 0 || valuationCount === 0) return "editorial-sparse";
  return "complete";
}

export default async function QuarterlyReportWorkspace({ params, searchParams }: { params: Promise<{ groupId: string; reportId: string }>; searchParams: Promise<{ ok?: string; error?: string; section?: string; propertyId?: string }> }) {
  const [{ groupId, reportId }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const report = await prisma.quarterlyReport.findFirst({
    where: { id: reportId, reportingGroupId: groupId },
    select: {
      id: true, year: true, quarter: true, revision: true, status: true, asOfDate: true, executiveSummary: true, publishedAssetId: true,
      reportingGroup: { select: { id: true, name: true } },
      propertyReports: { select: {
        propertyId: true, propertyNameSnapshot: true, propertyAddressSnapshot: true, propertyStatus: true, managementCommentary: true, technicalSections: true, valuationRows: true,
        snapshot: { select: { id: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true, data: true } },
      }, orderBy: [{ propertyNameSnapshot: "asc" }, { id: "asc" }] },
    },
  });
  if (!report) notFound();

  const qualityGate = quarterlyReportQualityGate(report.propertyReports.map((row) => ({ propertyId: row.propertyId, quality: row.snapshot.quality })));
  const parsedProperties = report.propertyReports.map((row) => {
    const technical = technicalSectionsSchema.safeParse(row.technicalSections ?? []);
    const valuations = valuationRowsSchema.safeParse(row.valuationRows ?? []);
    const snapshotData = quarterSnapshotDataSchema.safeParse(row.snapshot.data);
    const snapshotQuality = quarterSnapshotQualitySchema.safeParse(row.snapshot.quality);
    return { row, technical: technical.success ? technical.data : null, valuations: valuations.success ? valuations.data : null, snapshotData: snapshotData.success ? snapshotData.data : null, snapshotQuality: snapshotQuality.success ? snapshotQuality.data : null };
  });
  const properties: QuarterlyPropertyNavItem[] = parsedProperties.map(({ row, technical, valuations, snapshotQuality }) => ({
    propertyId: row.propertyId, propertyName: row.propertyNameSnapshot,
    completion: completionState(row.propertyStatus, row.managementCommentary, technical?.length || 0, valuations?.length || 0),
    warningCount: snapshotQuality?.issues.filter((issue) => issue.severity === "WARNING").length || 0,
    blockerCount: snapshotQuality ? snapshotQuality.issues.filter((issue) => issue.severity === "BLOCKER").length : 1,
  }));

  const reviewStarted = report.status === "REVIEW" ? await prisma.auditLog.findFirst({ where: { entityType: "QuarterlyReport", entityId: report.id, action: "REPORT_SUBMITTED_REVIEW" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const warningAcknowledgement = report.status === "REVIEW" && reviewStarted && qualityGate.warningCount > 0 ? await prisma.auditLog.findFirst({ where: { entityType: "QuarterlyReport", entityId: report.id, action: "REPORT_WARNINGS_ACKNOWLEDGED", createdAt: { gte: reviewStarted.createdAt } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const warningsAcknowledged = qualityGate.warningCount === 0 || Boolean(warningAcknowledgement);

  const requestedPropertyIndex = query.propertyId ? parsedProperties.findIndex(({ row }) => row.propertyId === query.propertyId) : -1;
  const activePropertyIndex = requestedPropertyIndex >= 0 ? requestedPropertyIndex : 0;
  const activeSection: "overview" | "property" | "review" = query.section === "review" || (!query.section && !query.propertyId && report.status !== "DRAFT") ? "review" : query.propertyId ? "property" : "overview";
  const active = parsedProperties[activePropertyIndex];
  const propertyIds = report.propertyReports.map((row) => row.propertyId);
  const candidates = report.status === "DRAFT" && propertyIds.length ? await prisma.quarterSnapshot.findMany({ where: { propertyId: { in: propertyIds }, asOfDate: report.asOfDate, source: { in: ["CALCULATED", "MANUAL_BASELINE"] } }, select: { id: true, propertyId: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true }, orderBy: [{ propertyId: "asc" }, { revision: "desc" }] }) : [];
  const baseHref = `/reporty/kvartalni/${groupId}/reporty/${reportId}`;
  const transitionAction = `/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/transition`;
  const admin = canAdminReportingBackoffice(permission);
  const executiveSummaryEditor = report.status === "DRAFT" ? <form className="edit-form" action={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/editorial`} method="post"><label className="field field-full"><span>Shrnutí za celou reportovací skupinu</span><textarea name="executiveSummary" defaultValue={report.executiveSummary || ""} maxLength={10000}/></label><div className="form-actions"><button className="primary" type="submit">Uložit shrnutí</button></div></form> : <p className="muted-copy pre-wrap">{report.executiveSummary || "Bez interního shrnutí"}</p>;

  return <Shell user={user}><div className="page quarterly-report-page"><div className="breadcrumb"><Link href={`/reporty/kvartalni/${groupId}`}>← {report.reportingGroup.name}</Link></div><div className="page-title"><div><h1>{report.year} Q{report.quarter}</h1><p>{report.reportingGroup.name} · revize {report.revision} · rozhodné datum {businessDateKey(report.asOfDate)}</p><span className="status">{statusLabels[report.status]}</span></div></div><Flash ok={query.ok} error={query.error}/>
    <div className="quarterly-workspace-layout"><QuarterlyReportWorkspaceNav baseHref={baseHref} activeSection={activeSection} activePropertyId={activeSection === "property" ? active?.row.propertyId : undefined} properties={properties}/><main>
      {activeSection === "overview" && <QuarterlyReportQuarterOverview year={report.year} quarter={report.quarter} groupName={report.reportingGroup.name} revision={report.revision} statusLabel={statusLabels[report.status]} properties={properties} quality={qualityGate} executiveSummaryEditor={executiveSummaryEditor}/>}
      {activeSection === "property" && active && <QuarterlyReportPropertyWorkspace property={{ propertyId: active.row.propertyId, propertyName: active.row.propertyNameSnapshot, propertyAddress: active.row.propertyAddressSnapshot, propertyStatus: active.row.propertyStatus, managementCommentary: active.row.managementCommentary, technicalSections: active.technical, valuationRows: active.valuations, snapshot: { id: active.row.snapshot.id, revision: active.row.snapshot.revision, source: active.row.snapshot.source, schemaVersion: active.row.snapshot.schemaVersion, calculatorVersion: active.row.snapshot.calculatorVersion, createdAt: active.row.snapshot.createdAt, sourceNote: active.row.snapshot.sourceNote, quality: active.row.snapshot.quality, data: active.snapshotData } }} candidates={candidates.filter((candidate) => candidate.propertyId === active.row.propertyId)} editable={report.status === "DRAFT"} baseAction={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/properties/${active.row.propertyId}`} previous={activePropertyIndex > 0 ? { id: parsedProperties[activePropertyIndex - 1].row.propertyId, name: parsedProperties[activePropertyIndex - 1].row.propertyNameSnapshot } : undefined} next={activePropertyIndex < parsedProperties.length - 1 ? { id: parsedProperties[activePropertyIndex + 1].row.propertyId, name: parsedProperties[activePropertyIndex + 1].row.propertyNameSnapshot } : undefined}/>}
      {activeSection === "review" && <QuarterlyReportReviewExport status={report.status} admin={admin} properties={properties} quality={qualityGate} warningsAcknowledged={warningsAcknowledged} transitionAction={transitionAction} groupId={groupId} reportId={reportId} publishedAssetId={report.publishedAssetId} persistentStorageAvailable={fileStorageCapabilities().persistentWrites}/>}
    </main></div>
  </div></Shell>;
}
