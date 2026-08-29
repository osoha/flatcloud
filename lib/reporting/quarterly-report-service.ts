import { Prisma, QuarterlyReportStatus, type PropertyReportingStatus } from "@prisma/client";
import { businessDateKeyToInstant, quarterEndKey } from "../calendar";
import { serializableTransaction } from "../serializable";
import { reportingGroupPropertiesAt, type ReportingUser } from "./access";
import { assertQuarterAndRevision, validateQuarterlyReportPeriod } from "./invariants";
import { calculateAndStoreSnapshotTx } from "./snapshot-service";

export type QuarterlyReportActor = Pick<ReportingUser, "id" | "role">;
type Tx = Prisma.TransactionClient;
const CREATE_RETRIES = 3;

export function assertReportTransitionAllowed(status: QuarterlyReportStatus | string, target: QuarterlyReportStatus | string, permission: string) {
  if (status === "PUBLISHED") throw new Error("Published report revisions are immutable.");
  const elevated = permission === "ADMIN" || permission === "SUPER_ADMIN";
  if (status === "DRAFT" && target === "REVIEW" && ["EDIT", "ADMIN", "SUPER_ADMIN"].includes(permission)) return;
  if (status === "REVIEW" && target === "DRAFT" && elevated) return;
  if (status === "REVIEW" && target === "PUBLISHED" && elevated) return;
  throw new Error("Reporting workflow transition is not permitted.");
}

export function assertSnapshotCompatibility(report: { asOfDate: Date; status: string }, propertyId: string, snapshot: { propertyId: string; asOfDate: Date; source: string }) {
  if (report.status !== "DRAFT") throw new Error("Report content can only change in DRAFT.");
  if (snapshot.propertyId !== propertyId) throw new Error("Snapshot property does not match the property report.");
  if (snapshot.asOfDate.getTime() !== report.asOfDate.getTime()) throw new Error("Snapshot as-of date does not match the report quarter.");
  if (!["CALCULATED", "MANUAL_BASELINE"].includes(snapshot.source)) throw new Error("Snapshot source is not selectable.");
}
export function assertEffectiveReportProperties<T>(properties: T[]) { if (!properties.length) throw new Error("Reporting group has no effective properties at report quarter end."); return properties; }
export function correctionPropertyData(row: { propertyId: string; snapshotId: string; propertyStatus: PropertyReportingStatus | null; managementCommentary: string | null; technicalSections: Prisma.JsonValue; valuationRows: Prisma.JsonValue }) {
  return { propertyId: row.propertyId, snapshotId: row.snapshotId, propertyStatus: row.propertyStatus, managementCommentary: row.managementCommentary, technicalSections: row.technicalSections === null ? Prisma.JsonNull : row.technicalSections, valuationRows: row.valuationRows === null ? Prisma.JsonNull : row.valuationRows };
}

async function permission(tx: Tx, actor: QuarterlyReportActor, reportingGroupId: string) {
  const [user, membership] = await Promise.all([
    tx.user.findUnique({ where: { id: actor.id }, select: { role: true, active: true } }),
    tx.reportingGroupMember.findUnique({ where: { reportingGroupId_userId: { reportingGroupId, userId: actor.id } }, select: { permission: true } }),
  ]);
  if (!user?.active) return "NONE";
  if (user.role === "SUPER_ADMIN") return "SUPER_ADMIN";
  return membership?.permission || "NONE";
}
async function requireEdit(tx: Tx, actor: QuarterlyReportActor, reportingGroupId: string) {
  const value = await permission(tx, actor, reportingGroupId);
  if (!["EDIT", "ADMIN", "SUPER_ADMIN"].includes(value)) throw new Error("Reporting EDIT permission is required.");
  return value;
}
async function requireAdmin(tx: Tx, actor: QuarterlyReportActor, reportingGroupId: string) {
  const value = await permission(tx, actor, reportingGroupId);
  if (!["ADMIN", "SUPER_ADMIN"].includes(value)) throw new Error("Reporting ADMIN permission is required.");
  return value;
}
function details(report: { id: string; reportingGroupId: string; year: number; quarter: number; revision: number }, extra: Prisma.InputJsonObject = {}) {
  return { reportId: report.id, reportingGroupId: report.reportingGroupId, year: report.year, quarter: report.quarter, revision: report.revision, ...extra } satisfies Prisma.InputJsonObject;
}
async function audit(tx: Tx, actorId: string, action: string, report: { id: string; reportingGroupId: string; year: number; quarter: number; revision: number }, extra?: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { userId: actorId, action, entityType: "QuarterlyReport", entityId: report.id, details: details(report, extra) } });
}
async function reportProperties(tx: Tx, reportingGroupId: string, asOfDate: Date) {
  const rows = await tx.reportingGroupProperty.findMany({ where: { reportingGroupId }, select: { propertyId: true, effectiveFrom: true, effectiveTo: true } });
  return reportingGroupPropertiesAt({ properties: rows }, asOfDate);
}

async function withCollisionRetry<T>(work: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) try { return await work(); } catch (error) {
    const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!collision || attempt >= CREATE_RETRIES) throw error;
  }
}

export async function createQuarterlyReport(input: { reportingGroupId: string; year: number; quarter: number; createdById: string }, actor: QuarterlyReportActor = { id: input.createdById, role: "USER" }) {
  if (input.createdById !== actor.id) throw new Error("Report creator must be the acting user.");
  assertQuarterAndRevision(input.quarter, 1);
  const asOfDate = businessDateKeyToInstant(quarterEndKey(input.year, input.quarter));
  validateQuarterlyReportPeriod({ asOfDate, year: input.year, quarter: input.quarter, revision: 1 });
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    await requireEdit(tx, actor, input.reportingGroupId);
    const latest = await tx.quarterlyReport.findFirst({ where: { reportingGroupId: input.reportingGroupId, year: input.year, quarter: input.quarter }, orderBy: { revision: "desc" } });
    if (latest) throw new Error(latest.status === "PUBLISHED" ? "Use correction workflow to create a revision of a published report." : "An active DRAFT or REVIEW report already exists for this quarter.");
    const properties = assertEffectiveReportProperties(await reportProperties(tx, input.reportingGroupId, asOfDate));
    const snapshots = [];
    for (const property of properties) snapshots.push(await calculateAndStoreSnapshotTx(tx, { propertyId: property.propertyId, asOf: asOfDate, createdById: input.createdById }));
    const report = await tx.quarterlyReport.create({ data: { reportingGroupId: input.reportingGroupId, year: input.year, quarter: input.quarter, revision: 1, status: "DRAFT", asOfDate, createdById: input.createdById, propertyReports: { create: snapshots.map((snapshot) => ({ propertyId: snapshot.propertyId, snapshotId: snapshot.id })) } } });
    await audit(tx, actor.id, "REPORT_CREATED", report);
    return report;
  }));
}

export async function selectSnapshot(reportId: string, propertyId: string, snapshotId: string, actor: QuarterlyReportActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, report.reportingGroupId);
    const snapshot = await tx.quarterSnapshot.findUnique({ where: { id: snapshotId } }); if (!snapshot) throw new Error("Quarter snapshot was not found.");
    assertSnapshotCompatibility(report, propertyId, snapshot);
    const changed = await tx.quarterlyPropertyReport.updateMany({ where: { quarterlyReportId: reportId, propertyId, quarterlyReport: { status: "DRAFT" } }, data: { snapshotId } });
    if (changed.count !== 1) throw new Error("Property report is missing or no longer editable.");
    await audit(tx, actor.id, "REPORT_SNAPSHOT_SELECTED", report, { propertyId, snapshotId });
    return tx.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: reportId, propertyId } } });
  });
}

export async function recalculatePropertySnapshot(reportId: string, propertyId: string, actor: QuarterlyReportActor) {
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, report.reportingGroupId); if (report.status !== "DRAFT") throw new Error("Report content can only change in DRAFT.");
    const propertyReport = await tx.quarterlyPropertyReport.findUnique({ where: { quarterlyReportId_propertyId: { quarterlyReportId: reportId, propertyId } } }); if (!propertyReport) throw new Error("Property report was not found.");
    const snapshot = await calculateAndStoreSnapshotTx(tx, { propertyId, asOf: report.asOfDate, createdById: actor.id });
    assertSnapshotCompatibility(report, propertyId, snapshot);
    const changed = await tx.quarterlyPropertyReport.updateMany({ where: { id: propertyReport.id, quarterlyReport: { status: "DRAFT" } }, data: { snapshotId: snapshot.id } });
    if (changed.count !== 1) throw new Error("Report is no longer editable.");
    await audit(tx, actor.id, "REPORT_SNAPSHOT_RECALCULATED", report, { propertyId, snapshotId: snapshot.id });
    return snapshot;
  }));
}

export async function submitQuarterlyReportForReview(reportId: string, actor: QuarterlyReportActor) { return transition(reportId, actor, "DRAFT", "REVIEW", "REPORT_SUBMITTED_REVIEW", false); }
export async function returnQuarterlyReportToDraft(reportId: string, actor: QuarterlyReportActor) { return transition(reportId, actor, "REVIEW", "DRAFT", "REPORT_RETURNED_DRAFT", true); }

async function transition(reportId: string, actor: QuarterlyReportActor, from: QuarterlyReportStatus, to: QuarterlyReportStatus, action: string, admin: boolean) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    const granted = admin ? await requireAdmin(tx, actor, report.reportingGroupId) : await requireEdit(tx, actor, report.reportingGroupId);
    assertReportTransitionAllowed(report.status, to, granted);
    const changed = await tx.quarterlyReport.updateMany({ where: { id: reportId, status: from }, data: { status: to, ...(to === "DRAFT" ? { reviewedById: null, publishedById: null, publishedAt: null } : {}) } });
    if (changed.count !== 1) throw new Error("Report status changed concurrently.");
    const updated = { ...report, status: to }; await audit(tx, actor.id, action, updated); return updated;
  });
}

export async function publishQuarterlyReport(reportId: string, actor: QuarterlyReportActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId }, include: { propertyReports: { include: { snapshot: true } } } }); if (!report) throw new Error("Quarterly report was not found.");
    const granted = await requireAdmin(tx, actor, report.reportingGroupId); assertReportTransitionAllowed(report.status, "PUBLISHED", granted);
    const expected = await reportProperties(tx, report.reportingGroupId, report.asOfDate); const expectedIds = new Set(expected.map((row) => row.propertyId));
    if (report.propertyReports.length !== expectedIds.size || new Set(report.propertyReports.map((row) => row.propertyId)).size !== expectedIds.size || report.propertyReports.some((row) => !expectedIds.has(row.propertyId))) throw new Error("Report property scope is incomplete or inconsistent.");
    for (const row of report.propertyReports) assertSnapshotCompatibility({ asOfDate: report.asOfDate, status: "DRAFT" }, row.propertyId, row.snapshot);
    const publishedAt = new Date(); const changed = await tx.quarterlyReport.updateMany({ where: { id: reportId, status: "REVIEW" }, data: { status: "PUBLISHED", reviewedById: actor.id, publishedById: actor.id, publishedAt } });
    if (changed.count !== 1) throw new Error("Report status changed concurrently.");
    const updated = { ...report, status: "PUBLISHED" as const, reviewedById: actor.id, publishedById: actor.id, publishedAt }; await audit(tx, actor.id, "REPORT_PUBLISHED", updated); return updated;
  });
}

export async function createCorrectionRevision(publishedReportId: string, actor: QuarterlyReportActor) {
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    const source = await tx.quarterlyReport.findUnique({ where: { id: publishedReportId }, include: { propertyReports: true } }); if (!source) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, source.reportingGroupId); if (source.status !== "PUBLISHED") throw new Error("Corrections can only be created from a published report.");
    const latest = await tx.quarterlyReport.findFirst({ where: { reportingGroupId: source.reportingGroupId, year: source.year, quarter: source.quarter }, orderBy: { revision: "desc" } });
    if (!latest || latest.id !== source.id) throw new Error("Correction must be created from the latest published revision and no active revision may exist.");
    const revision = source.revision + 1; assertQuarterAndRevision(source.quarter, revision);
    const report = await tx.quarterlyReport.create({ data: { reportingGroupId: source.reportingGroupId, year: source.year, quarter: source.quarter, revision, status: "DRAFT", asOfDate: source.asOfDate, createdById: actor.id, propertyReports: { create: source.propertyReports.map(correctionPropertyData) } } });
    await audit(tx, actor.id, "REPORT_REVISION_CREATED", report); return report;
  }));
}
