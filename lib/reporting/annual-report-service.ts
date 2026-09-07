import { AnnualReportStatus, Prisma } from "@prisma/client";
import { businessDateKey, businessDateKeyToInstant, type BusinessDateKey } from "../calendar";
import { prisma } from "../db";
import { serializableTransaction } from "../serializable";
import { reportingGroupPropertiesAt } from "./access";
import { requireReportingBackoffice, type ReportingBackofficeActor } from "./backoffice-access";
import {
  annualPropertyEditorialSchema,
  annualReportEditorialSchema,
  type AnnualPropertyEditorialInput,
  type AnnualReportEditorialInput,
} from "./annual-report-schema";
import { calculateAndStoreSnapshotTx } from "./snapshot-service";

type Tx = Prisma.TransactionClient;
const CREATE_RETRIES = 3;

type AnnualCompletenessReport = {
  founderLetter: string | null;
  executiveSummary: string | null;
  investmentThesis: string | null;
  valueCreationSummary: string | null;
  outlook: string | null;
  grossAssetValueCents: bigint | null;
  netAssetValueCents: bigint | null;
  debtCents: bigint | null;
  targetPortfolioValueCents: bigint | null;
  issuedShares: number | null;
  treasuryShares: number | null;
  sharePriceCents: bigint | null;
  propertyReports: Array<{
    propertyNameSnapshot: string;
    openingValueCents: bigint | null;
    currentValueCents: bigint | null;
    targetValueCents: bigint | null;
    investmentCase: string | null;
    valueCreationNarrative: string | null;
    outlook: string | null;
    sourceNote: string | null;
  }>;
};

export function assertAnnualReportYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("Annual report year is invalid.");
  return year;
}

function annualAsOfDate(year: number) {
  assertAnnualReportYear(year);
  return businessDateKeyToInstant(`${year}-12-31` as BusinessDateKey);
}

export function annualPeriodState(asOfDate: Date, now = new Date()) {
  const reportDate = businessDateKey(asOfDate);
  const today = businessDateKey(now);
  return { reportDate, dataThrough: reportDate > today ? today : reportDate, open: reportDate > today };
}

export function assertAnnualPeriodClosed(asOfDate: Date, now = new Date()) {
  const state = annualPeriodState(asOfDate, now);
  if (state.open) throw new Error(`Annual report period is still open. Review and publication must wait until ${state.reportDate}.`);
  return state;
}

export function assertAnnualReportTransitionAllowed(status: AnnualReportStatus | string, target: AnnualReportStatus | string, permission: string) {
  if (status === "PUBLISHED") throw new Error("Published annual report revisions are immutable.");
  const admin = permission === "ADMIN" || permission === "SUPER_ADMIN";
  if (status === "DRAFT" && target === "REVIEW" && ["EDIT", "ADMIN", "SUPER_ADMIN"].includes(permission)) return;
  if (status === "REVIEW" && target === "DRAFT" && admin) return;
  if (status === "REVIEW" && target === "PUBLISHED" && admin) return;
  throw new Error("Annual reporting workflow transition is not permitted.");
}

export function annualReportMissingFields(report: AnnualCompletenessReport) {
  const missing: string[] = [];
  const corporateText = [
    ["Slovo zakladatele", report.founderLetter],
    ["Manažerské shrnutí", report.executiveSummary],
    ["Investiční teze", report.investmentThesis],
    ["Tvorba hodnoty", report.valueCreationSummary],
    ["Výhled", report.outlook],
  ] as const;
  for (const [label, value] of corporateText) if (!value?.trim()) missing.push(label);
  const corporateNumbers = [
    ["Hrubá hodnota aktiv", report.grossAssetValueCents],
    ["Čistá hodnota aktiv", report.netAssetValueCents],
    ["Dluh", report.debtCents],
    ["Cílová hodnota portfolia", report.targetPortfolioValueCents],
    ["Vydané akcie", report.issuedShares],
    ["Vlastní akcie", report.treasuryShares],
    ["Cena akcie", report.sharePriceCents],
  ] as const;
  for (const [label, value] of corporateNumbers) if (value === null) missing.push(label);
  for (const property of report.propertyReports) {
    const prefix = property.propertyNameSnapshot;
    if (property.openingValueCents === null) missing.push(`${prefix}: hodnota na začátku roku`);
    if (property.currentValueCents === null) missing.push(`${prefix}: hodnota ke konci roku`);
    if (property.targetValueCents === null) missing.push(`${prefix}: cílová hodnota`);
    if (!property.investmentCase?.trim()) missing.push(`${prefix}: investiční případ`);
    if (!property.valueCreationNarrative?.trim()) missing.push(`${prefix}: tvorba hodnoty`);
    if (!property.outlook?.trim()) missing.push(`${prefix}: výhled`);
    if (!property.sourceNote?.trim()) missing.push(`${prefix}: zdroj hodnot`);
  }
  return missing;
}

function frozenPropertyAddress(property: { address: string; city: string; postalCode: string | null }) {
  return `${property.address}, ${property.postalCode ? `${property.postalCode} ` : ""}${property.city}`;
}

function auditDetails(report: { id: string; reportingGroupId: string; year: number; revision: number }, extra: Prisma.InputJsonObject = {}) {
  return { reportId: report.id, reportingGroupId: report.reportingGroupId, year: report.year, revision: report.revision, ...extra } satisfies Prisma.InputJsonObject;
}

async function audit(tx: Tx, actorId: string, action: string, report: { id: string; reportingGroupId: string; year: number; revision: number }, extra?: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { userId: actorId, action, entityType: "AnnualReport", entityId: report.id, details: auditDetails(report, extra) } });
}

async function effectiveProperties(tx: Tx, reportingGroupId: string, asOfDate: Date) {
  const rows = await tx.reportingGroupProperty.findMany({
    where: { reportingGroupId },
    select: { propertyId: true, effectiveFrom: true, effectiveTo: true, property: { select: { name: true, address: true, city: true, postalCode: true } } },
  });
  return reportingGroupPropertiesAt({ properties: rows }, asOfDate);
}

async function withCollisionRetry<T>(work: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) try { return await work(); } catch (error) {
    const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!collision || attempt >= CREATE_RETRIES) throw error;
  }
}

export async function createAnnualReport(input: { reportingGroupId: string; year: number }, actor: ReportingBackofficeActor) {
  const asOfDate = annualAsOfDate(input.year);
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    await requireReportingBackoffice(actor, input.reportingGroupId, "EDIT", tx);
    const group = await tx.reportingGroup.findUnique({ where: { id: input.reportingGroupId }, select: { active: true, name: true } });
    if (!group?.active) throw new Error("Reporting group is inactive.");
    if (await tx.annualReport.findFirst({ where: { reportingGroupId: input.reportingGroupId, year: input.year } })) {
      throw new Error("An annual report already exists for this year.");
    }
    const properties = await effectiveProperties(tx, input.reportingGroupId, asOfDate);
    if (!properties.length) throw new Error("Reporting group has no effective properties at annual report end.");
    const snapshots = [];
    for (const property of properties) snapshots.push(await calculateAndStoreSnapshotTx(tx, { propertyId: property.propertyId, asOf: asOfDate, createdById: actor.id }));
    const identityByProperty = new Map(properties.map((row) => [row.propertyId, row.property]));
    const report = await tx.annualReport.create({
      data: {
        reportingGroupId: input.reportingGroupId,
        reportingGroupNameSnapshot: group.name,
        year: input.year,
        revision: 1,
        status: "DRAFT",
        asOfDate,
        createdById: actor.id,
        propertyReports: {
          create: snapshots.map((snapshot) => {
            const property = identityByProperty.get(snapshot.propertyId)!;
            return {
              propertyId: snapshot.propertyId,
              propertyNameSnapshot: property.name,
              propertyAddressSnapshot: frozenPropertyAddress(property),
              snapshotId: snapshot.id,
            };
          }),
        },
      },
    });
    await audit(tx, actor.id, "ANNUAL_REPORT_CREATED", report, { propertyCount: snapshots.length });
    return report;
  }));
}

export async function updateAnnualReportEditorial(reportId: string, input: AnnualReportEditorialInput, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.annualReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error("Annual report was not found.");
    await requireReportingBackoffice(actor, report.reportingGroupId, "EDIT", tx);
    if (report.status !== "DRAFT") throw new Error("Annual report content can only change in DRAFT.");
    const content = annualReportEditorialSchema.parse(input);
    const changed = await tx.annualReport.updateMany({ where: { id: report.id, status: "DRAFT" }, data: content });
    if (changed.count !== 1) throw new Error("Annual report is no longer editable.");
    await audit(tx, actor.id, "ANNUAL_REPORT_EDITORIAL_UPDATED", report, {
      changedFields: Object.keys(content),
      hasSharePrice: content.sharePriceCents !== null,
      hasTargetPortfolioValue: content.targetPortfolioValueCents !== null,
    });
    return tx.annualReport.findUniqueOrThrow({ where: { id: report.id } });
  });
}

export async function updateAnnualPropertyEditorial(reportId: string, propertyId: string, input: AnnualPropertyEditorialInput, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await tx.annualReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error("Annual report was not found.");
    await requireReportingBackoffice(actor, report.reportingGroupId, "EDIT", tx);
    if (report.status !== "DRAFT") throw new Error("Annual report content can only change in DRAFT.");
    const content = annualPropertyEditorialSchema.parse(input);
    const changed = await tx.annualPropertyReport.updateMany({
      where: { annualReportId: report.id, propertyId, annualReport: { status: "DRAFT" } },
      data: content,
    });
    if (changed.count !== 1) throw new Error("Annual property chapter is missing or no longer editable.");
    await audit(tx, actor.id, "ANNUAL_PROPERTY_EDITORIAL_UPDATED", report, {
      propertyId,
      changedFields: Object.keys(content),
      hasTargetValue: content.targetValueCents !== null,
      hasExitPlan: content.plannedExitProceedsCents !== null || content.plannedExitYear !== null,
    });
    return tx.annualPropertyReport.findUniqueOrThrow({ where: { annualReportId_propertyId: { annualReportId: report.id, propertyId } } });
  });
}

export async function requireAnnualReportInGroup(reportId: string, groupId: string) {
  const report = await prisma.annualReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { id: true } });
  if (!report) throw new Error("Annual report was not found.");
}

async function currentAnnualReviewStartedAt(tx: Tx, reportId: string) {
  const event = await tx.auditLog.findFirst({
    where: { entityType: "AnnualReport", entityId: reportId, action: "ANNUAL_REPORT_SUBMITTED_REVIEW" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return event?.createdAt || null;
}

async function annualPreviewApprovedForCurrentReview(tx: Tx, reportId: string) {
  const reviewStartedAt = await currentAnnualReviewStartedAt(tx, reportId);
  if (!reviewStartedAt) return false;
  return Boolean(await tx.auditLog.findFirst({
    where: { entityType: "AnnualReport", entityId: reportId, action: "ANNUAL_REPORT_PREVIEW_APPROVED", createdAt: { gte: reviewStartedAt } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  }));
}

async function annualReportForGate(tx: Tx, reportId: string) {
  const report = await tx.annualReport.findUnique({
    where: { id: reportId },
    include: { propertyReports: { include: { snapshot: true } } },
  });
  if (!report) throw new Error("Annual report was not found.");
  return report;
}

async function assertAnnualScopeAndSnapshots(tx: Tx, report: Awaited<ReturnType<typeof annualReportForGate>>) {
  const expected = await effectiveProperties(tx, report.reportingGroupId, report.asOfDate);
  const expectedIds = new Set(expected.map((row) => row.propertyId));
  if (
    report.propertyReports.length !== expectedIds.size ||
    new Set(report.propertyReports.map((row) => row.propertyId)).size !== expectedIds.size ||
    report.propertyReports.some((row) => !expectedIds.has(row.propertyId))
  ) throw new Error("Annual report property scope is incomplete or inconsistent.");
  for (const row of report.propertyReports) {
    if (row.snapshot.propertyId !== row.propertyId || row.snapshot.asOfDate.getTime() !== report.asOfDate.getTime()) {
      throw new Error("Annual report snapshot scope is inconsistent.");
    }
    if (!["CALCULATED", "MANUAL_BASELINE"].includes(row.snapshot.source)) throw new Error("Annual report snapshot source is invalid.");
  }
}

export async function submitAnnualReportForReview(reportId: string, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await annualReportForGate(tx, reportId);
    const permission = await requireReportingBackoffice(actor, report.reportingGroupId, "EDIT", tx);
    assertAnnualReportTransitionAllowed(report.status, "REVIEW", permission);
    assertAnnualPeriodClosed(report.asOfDate);
    await assertAnnualScopeAndSnapshots(tx, report);
    const missingFields = annualReportMissingFields(report);
    if (missingFields.length) throw new Error(`Annual report is incomplete: ${missingFields.join("; ")}`);
    const changed = await tx.annualReport.updateMany({ where: { id: report.id, status: "DRAFT" }, data: { status: "REVIEW" } });
    if (changed.count !== 1) throw new Error("Annual report status changed concurrently.");
    const updated = { ...report, status: "REVIEW" as const };
    await audit(tx, actor.id, "ANNUAL_REPORT_SUBMITTED_REVIEW", updated, { propertyCount: report.propertyReports.length });
    return updated;
  });
}

export async function returnAnnualReportToDraft(reportId: string, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await annualReportForGate(tx, reportId);
    const permission = await requireReportingBackoffice(actor, report.reportingGroupId, "ADMIN", tx);
    assertAnnualReportTransitionAllowed(report.status, "DRAFT", permission);
    const changed = await tx.annualReport.updateMany({ where: { id: report.id, status: "REVIEW" }, data: { status: "DRAFT", reviewedById: null, publishedById: null, publishedAt: null } });
    if (changed.count !== 1) throw new Error("Annual report status changed concurrently.");
    const updated = { ...report, status: "DRAFT" as const };
    await audit(tx, actor.id, "ANNUAL_REPORT_RETURNED_DRAFT", updated);
    return updated;
  });
}

export async function approveAnnualReportPreview(reportId: string, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await annualReportForGate(tx, reportId);
    await requireReportingBackoffice(actor, report.reportingGroupId, "ADMIN", tx);
    if (report.status !== "REVIEW") throw new Error("Annual report preview can only be approved in REVIEW.");
    await audit(tx, actor.id, "ANNUAL_REPORT_PREVIEW_APPROVED", report, { propertyCount: report.propertyReports.length });
    return report;
  });
}

export async function publishAnnualReport(reportId: string, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => {
    const report = await annualReportForGate(tx, reportId);
    const permission = await requireReportingBackoffice(actor, report.reportingGroupId, "ADMIN", tx);
    assertAnnualReportTransitionAllowed(report.status, "PUBLISHED", permission);
    assertAnnualPeriodClosed(report.asOfDate);
    await assertAnnualScopeAndSnapshots(tx, report);
    const missingFields = annualReportMissingFields(report);
    if (missingFields.length) throw new Error(`Annual report is incomplete: ${missingFields.join("; ")}`);
    if (!(await annualPreviewApprovedForCurrentReview(tx, report.id))) throw new Error("Annual report PDF preview must be approved before publication.");
    const publishedAt = new Date();
    const changed = await tx.annualReport.updateMany({
      where: { id: report.id, status: "REVIEW" },
      data: { status: "PUBLISHED", reviewedById: actor.id, publishedById: actor.id, publishedAt },
    });
    if (changed.count !== 1) throw new Error("Annual report status changed concurrently.");
    const updated = { ...report, status: "PUBLISHED" as const, reviewedById: actor.id, publishedById: actor.id, publishedAt };
    await audit(tx, actor.id, "ANNUAL_REPORT_PUBLISHED", updated, { propertyCount: report.propertyReports.length, previewApproved: true });
    return updated;
  });
}

export async function createAnnualCorrectionRevision(publishedReportId: string, actor: ReportingBackofficeActor) {
  return withCollisionRetry(() => serializableTransaction(async (tx) => {
    const source = await tx.annualReport.findUnique({ where: { id: publishedReportId }, include: { propertyReports: true } });
    if (!source) throw new Error("Annual report was not found.");
    await requireReportingBackoffice(actor, source.reportingGroupId, "EDIT", tx);
    if (source.status !== "PUBLISHED") throw new Error("Annual corrections can only be created from a published report.");
    const latest = await tx.annualReport.findFirst({ where: { reportingGroupId: source.reportingGroupId, year: source.year }, orderBy: { revision: "desc" } });
    if (!latest || latest.id !== source.id) throw new Error("Annual correction must be created from the latest published revision and no active revision may exist.");
    const revision = source.revision + 1;
    const report = await tx.annualReport.create({
      data: {
        reportingGroupId: source.reportingGroupId,
        reportingGroupNameSnapshot: source.reportingGroupNameSnapshot,
        year: source.year,
        revision,
        status: "DRAFT",
        asOfDate: source.asOfDate,
        founderLetter: source.founderLetter,
        executiveSummary: source.executiveSummary,
        investmentThesis: source.investmentThesis,
        valueCreationSummary: source.valueCreationSummary,
        outlook: source.outlook,
        grossAssetValueCents: source.grossAssetValueCents,
        netAssetValueCents: source.netAssetValueCents,
        debtCents: source.debtCents,
        targetPortfolioValueCents: source.targetPortfolioValueCents,
        realizedExitProceedsCents: source.realizedExitProceedsCents,
        plannedExitProceedsCents: source.plannedExitProceedsCents,
        issuedShares: source.issuedShares,
        treasuryShares: source.treasuryShares,
        sharePriceCents: source.sharePriceCents,
        designTemplateVersionId: source.designTemplateVersionId,
        createdById: actor.id,
        propertyReports: { create: source.propertyReports.map((row) => ({
          propertyId: row.propertyId,
          propertyNameSnapshot: row.propertyNameSnapshot,
          propertyAddressSnapshot: row.propertyAddressSnapshot,
          snapshotId: row.snapshotId,
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
        })) },
      },
    });
    await audit(tx, actor.id, "ANNUAL_REPORT_REVISION_CREATED", report, { sourceReportId: source.id });
    return report;
  }));
}
