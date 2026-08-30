import { Prisma, QuarterlyReportStatus, type PropertyReportingStatus } from "@prisma/client";
import { businessDateKeyToInstant, quarterEndKey } from "../calendar";
import { serializableTransaction } from "../serializable";
import { reportingGroupPropertiesAt, type ReportingUser } from "./access";
import { assertQuarterAndRevision, validateQuarterlyReportPeriod } from "./invariants";
import { calculateAndStoreSnapshotTx } from "./snapshot-service";
import { quarterlyPropertyReportContentSchema, quarterlyReportEditorialSchema, type QuarterlyPropertyReportContentInput, type QuarterlyReportEditorialInput } from "./editorial-schema";
import { quarterlyReportQualityGate } from "./quarterly-quality-gate";

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
export function correctionPropertyData(row: { propertyId: string; propertyNameSnapshot: string; propertyAddressSnapshot: string; snapshotId: string; propertyStatus: PropertyReportingStatus | null; managementCommentary: string | null; technicalSections: Prisma.JsonValue; valuationRows: Prisma.JsonValue }) {
  return { propertyId: row.propertyId, propertyNameSnapshot: row.propertyNameSnapshot, propertyAddressSnapshot: row.propertyAddressSnapshot, snapshotId: row.snapshotId, propertyStatus: row.propertyStatus, managementCommentary: row.managementCommentary, technicalSections: row.technicalSections === null ? Prisma.JsonNull : row.technicalSections, valuationRows: row.valuationRows === null ? Prisma.JsonNull : row.valuationRows };
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
  const rows = await tx.reportingGroupProperty.findMany({ where: { reportingGroupId }, select: { propertyId: true, effectiveFrom: true, effectiveTo: true, property: { select: { name: true, address: true, city: true, postalCode: true } } } });
  return reportingGroupPropertiesAt({ properties: rows }, asOfDate);
}

function frozenPropertyAddress(property: { address: string; city: string; postalCode: string | null }) { return `${property.address}, ${property.postalCode ? `${property.postalCode} ` : ""}${property.city}`; }

async function currentReviewStartedAt(tx: Tx, reportId: string) {
  const event = await tx.auditLog.findFirst({
    where: {
      entityType: "QuarterlyReport",
      entityId: reportId,
      action: "REPORT_SUBMITTED_REVIEW",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return event?.createdAt || null;
}

async function hasCurrentWarningAcknowledgement(tx: Tx, reportId: string) {
  const reviewStartedAt = await currentReviewStartedAt(tx, reportId);
  if (!reviewStartedAt) return false;

  return Boolean(
    await tx.auditLog.findFirst({
      where: {
        entityType: "QuarterlyReport",
        entityId: reportId,
        action: "REPORT_WARNINGS_ACKNOWLEDGED",
        createdAt: { gte: reviewStartedAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  );
}

async function withCollisionRetry<T>(work: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) try { return await work(); } catch (error) {
    const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!collision || attempt >= CREATE_RETRIES) throw error;
  }
}

export async function createQuarterlyReport(input: { reportingGroupId: string; year: number; quarter: number }, actor: QuarterlyReportActor) {
  assertQuarterAndRevision(input.quarter, 1);
  const asOfDate = businessDateKeyToInstant(quarterEndKey(input.year, input.quarter));
  validateQuarterlyReportPeriod({ asOfDate, year: input.year, quarter: input.quarter, revision: 1 });
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    await requireEdit(tx, actor, input.reportingGroupId);
    const group = await tx.reportingGroup.findUnique({ where: { id: input.reportingGroupId }, select: { active: true, name: true } });
    if (!group?.active) throw new Error("Reporting group is inactive.");
    const latest = await tx.quarterlyReport.findFirst({ where: { reportingGroupId: input.reportingGroupId, year: input.year, quarter: input.quarter }, orderBy: { revision: "desc" } });
    if (latest) throw new Error(latest.status === "PUBLISHED" ? "Use correction workflow to create a revision of a published report." : "An active DRAFT or REVIEW report already exists for this quarter.");
    const properties = assertEffectiveReportProperties(await reportProperties(tx, input.reportingGroupId, asOfDate));
    const snapshots = [];
    for (const property of properties) snapshots.push(await calculateAndStoreSnapshotTx(tx, { propertyId: property.propertyId, asOf: asOfDate, createdById: actor.id }));
    const identityByProperty = new Map(properties.map((row) => [row.propertyId, row.property]));
    const report = await tx.quarterlyReport.create({ data: { reportingGroupId: input.reportingGroupId, reportingGroupNameSnapshot: group.name, year: input.year, quarter: input.quarter, revision: 1, status: "DRAFT", asOfDate, createdById: actor.id, propertyReports: { create: snapshots.map((snapshot) => { const property = identityByProperty.get(snapshot.propertyId)!; return { propertyId: snapshot.propertyId, propertyNameSnapshot: property.name, propertyAddressSnapshot: frozenPropertyAddress(property), snapshotId: snapshot.id }; }) } } });
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

export async function updateQuarterlyReportEditorial(reportId: string, input: QuarterlyReportEditorialInput, actor: QuarterlyReportActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, report.reportingGroupId);
    if (report.status !== "DRAFT") throw new Error("Editorial content can only change in DRAFT.");
    const editorial = quarterlyReportEditorialSchema.parse(input);
    const changed = await tx.quarterlyReport.updateMany({ where: { id: reportId, status: "DRAFT" }, data: { executiveSummary: editorial.executiveSummary } });
    if (changed.count !== 1) throw new Error("Report is no longer editable.");
    await audit(tx, actor.id, "REPORT_EDITORIAL_UPDATED", report, { changedFields: ["executiveSummary"], hasExecutiveSummary: editorial.executiveSummary !== null });
    return tx.quarterlyReport.findUniqueOrThrow({ where: { id: reportId } });
  });
}

export async function updateQuarterlyPropertyReportContent(reportId: string, propertyId: string, input: QuarterlyPropertyReportContentInput, actor: QuarterlyReportActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, report.reportingGroupId);
    if (report.status !== "DRAFT") throw new Error("Editorial content can only change in DRAFT.");
    const content = quarterlyPropertyReportContentSchema.parse(input);
    const changed = await tx.quarterlyPropertyReport.updateMany({ where: { quarterlyReportId: reportId, propertyId, quarterlyReport: { status: "DRAFT" } }, data: { propertyStatus: content.propertyStatus, managementCommentary: content.managementCommentary, technicalSections: content.technicalSections, valuationRows: content.valuationRows } });
    if (changed.count !== 1) throw new Error("Property report is missing or no longer editable.");
    await audit(tx, actor.id, "REPORT_PROPERTY_CONTENT_UPDATED", report, { propertyId, changedFields: ["propertyStatus", "managementCommentary", "technicalSections", "valuationRows"], technicalSectionCount: content.technicalSections.length, valuationRowCount: content.valuationRows.length });
    return tx.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: reportId, propertyId } } });
  });
}

export async function submitQuarterlyReportForReview(reportId: string, actor: QuarterlyReportActor) { return transition(reportId, actor, "DRAFT", "REVIEW", "REPORT_SUBMITTED_REVIEW", false); }
export async function returnQuarterlyReportToDraft(reportId: string, actor: QuarterlyReportActor) { return transition(reportId, actor, "REVIEW", "DRAFT", "REPORT_RETURNED_DRAFT", true); }

async function transition(reportId: string, actor: QuarterlyReportActor, from: QuarterlyReportStatus, to: QuarterlyReportStatus, action: string, admin: boolean) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({ where: { id: reportId } }); if (!report) throw new Error("Quarterly report was not found.");
    const granted = admin ? await requireAdmin(tx, actor, report.reportingGroupId) : await requireEdit(tx, actor, report.reportingGroupId);
    assertReportTransitionAllowed(report.status, to, granted);
    if (from === "DRAFT" && to === "REVIEW") {
      const properties = await tx.quarterlyPropertyReport.findMany({ where: { quarterlyReportId: reportId }, select: { propertyStatus: true } });
      if (properties.some((property) => property.propertyStatus === null)) throw new Error("Every property report must have a property status before review.");
    }
    const changed = await tx.quarterlyReport.updateMany({ where: { id: reportId, status: from }, data: { status: to, ...(to === "DRAFT" ? { reviewedById: null, publishedById: null, publishedAt: null } : {}) } });
    if (changed.count !== 1) throw new Error("Report status changed concurrently.");
    const updated = { ...report, status: to }; await audit(tx, actor.id, action, updated); return updated;
  });
}

export async function acknowledgeQuarterlyReportWarnings(
  reportId: string,
  actor: QuarterlyReportActor,
) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({
      where: { id: reportId },
      include: {
        propertyReports: {
          include: {
            snapshot: { select: { quality: true } },
          },
        },
      },
    });

    if (!report) throw new Error("Quarterly report was not found.");

    await requireAdmin(tx, actor, report.reportingGroupId);

    if (report.status !== "REVIEW") {
      throw new Error("Warnings can only be acknowledged in REVIEW.");
    }

    const gate = quarterlyReportQualityGate(
      report.propertyReports.map((row) => ({
        propertyId: row.propertyId,
        quality: row.snapshot.quality,
      })),
    );

    if (gate.blockerCount > 0) {
      throw new Error("Report has blocking data quality issues.");
    }

    if (gate.warningCount === 0) {
      throw new Error("Report has no warnings to acknowledge.");
    }

    const reviewStartedAt = await currentReviewStartedAt(tx, reportId);

    if (!reviewStartedAt) {
      throw new Error("Current review cycle was not found.");
    }

    await audit(tx, actor.id, "REPORT_WARNINGS_ACKNOWLEDGED", report, {
      warningCount: gate.warningCount,
      infoCount: gate.infoCount,
      reviewStartedAt: reviewStartedAt.toISOString(),
    });

    return gate;
  });
}

export async function publishQuarterlyReport(
  reportId: string,
  actor: QuarterlyReportActor,
) {
  return serializableTransaction(async (tx) => {
    const report = await tx.quarterlyReport.findUnique({
      where: { id: reportId },
      include: {
        propertyReports: {
          include: { snapshot: true },
        },
      },
    });

    if (!report) throw new Error("Quarterly report was not found.");

    const granted = await requireAdmin(tx, actor, report.reportingGroupId);
    assertReportTransitionAllowed(report.status, "PUBLISHED", granted);

    const expected = await reportProperties(
      tx,
      report.reportingGroupId,
      report.asOfDate,
    );
    const expectedIds = new Set(expected.map((row) => row.propertyId));

    if (
      report.propertyReports.length !== expectedIds.size ||
      new Set(report.propertyReports.map((row) => row.propertyId)).size !==
        expectedIds.size ||
      report.propertyReports.some((row) => !expectedIds.has(row.propertyId))
    ) {
      throw new Error("Report property scope is incomplete or inconsistent.");
    }

    for (const row of report.propertyReports) {
      assertSnapshotCompatibility(
        { asOfDate: report.asOfDate, status: "DRAFT" },
        row.propertyId,
        row.snapshot,
      );
    }

    const gate = quarterlyReportQualityGate(
      report.propertyReports.map((row) => ({
        propertyId: row.propertyId,
        quality: row.snapshot.quality,
      })),
    );

    if (gate.blockerCount > 0) {
      throw new Error("Report has blocking data quality issues.");
    }

    if (
      gate.warningCount > 0 &&
      !(await hasCurrentWarningAcknowledgement(tx, reportId))
    ) {
      throw new Error(
        "Report warnings must be acknowledged before publication.",
      );
    }

    const publishedAt = new Date();

    const changed = await tx.quarterlyReport.updateMany({
      where: { id: reportId, status: "REVIEW" },
      data: {
        status: "PUBLISHED",
        reviewedById: actor.id,
        publishedById: actor.id,
        publishedAt,
      },
    });

    if (changed.count !== 1) {
      throw new Error("Report status changed concurrently.");
    }

    const updated = {
      ...report,
      status: "PUBLISHED" as const,
      reviewedById: actor.id,
      publishedById: actor.id,
      publishedAt,
    };

    await audit(tx, actor.id, "REPORT_PUBLISHED", updated, {
      qualityInfoCount: gate.infoCount,
      qualityWarningCount: gate.warningCount,
      qualityBlockerCount: gate.blockerCount,
    });

    return updated;
  });
}

export async function createCorrectionRevision(publishedReportId: string, actor: QuarterlyReportActor) {
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    const source = await tx.quarterlyReport.findUnique({ where: { id: publishedReportId }, include: { propertyReports: true } }); if (!source) throw new Error("Quarterly report was not found.");
    await requireEdit(tx, actor, source.reportingGroupId); if (source.status !== "PUBLISHED") throw new Error("Corrections can only be created from a published report.");
    const latest = await tx.quarterlyReport.findFirst({ where: { reportingGroupId: source.reportingGroupId, year: source.year, quarter: source.quarter }, orderBy: { revision: "desc" } });
    if (!latest || latest.id !== source.id) throw new Error("Correction must be created from the latest published revision and no active revision may exist.");
    const revision = source.revision + 1; assertQuarterAndRevision(source.quarter, revision);
    const report = await tx.quarterlyReport.create({ data: { reportingGroupId: source.reportingGroupId, reportingGroupNameSnapshot: source.reportingGroupNameSnapshot, year: source.year, quarter: source.quarter, revision, status: "DRAFT", asOfDate: source.asOfDate, executiveSummary: source.executiveSummary, createdById: actor.id, propertyReports: { create: source.propertyReports.map(correctionPropertyData) } } });
    await audit(tx, actor.id, "REPORT_REVISION_CREATED", report); return report;
  }));
}
