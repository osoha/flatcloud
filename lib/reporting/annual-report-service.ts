import { Prisma } from "@prisma/client";
import { businessDateKeyToInstant, type BusinessDateKey } from "../calendar";
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

export function assertAnnualReportYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("Annual report year is invalid.");
  return year;
}

function annualAsOfDate(year: number) {
  assertAnnualReportYear(year);
  return businessDateKeyToInstant(`${year}-12-31` as BusinessDateKey);
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
