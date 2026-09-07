import { prisma } from "@/lib/db";
import { businessDateKeyToInstant } from "@/lib/calendar";
import { annualReportMissingFields } from "@/lib/reporting/annual-report-service";
import {
  listReportingBackofficeGroups,
  type ReportingBackofficeActor,
} from "@/lib/reporting/backoffice-access";
import { reportingGroupPropertiesAt } from "@/lib/reporting/access";

export type ReadinessTone = "ok" | "warn" | "bad";

export function annualChecklistTone(input: {
  propertyCount: number;
  hasPublishedQ4: boolean;
  annualStatus: string | null;
  annualMissingCount: number;
  missingValuations: number;
  missingBudgets: number;
  unresolvedCosts: number;
}): ReadinessTone {
  if (
    !input.propertyCount ||
    !input.hasPublishedQ4 ||
    !input.annualStatus ||
    input.missingValuations ||
    input.missingBudgets ||
    input.unresolvedCosts
  )
    return "bad";
  if (input.annualStatus !== "PUBLISHED" || input.annualMissingCount)
    return "warn";
  return "ok";
}

export async function loadAnnualReadiness(
  actor: ReportingBackofficeActor,
  year: number,
) {
  const visible = await listReportingBackofficeGroups(actor);
  if (!visible.length) return [];
  const groupIds = visible.map((group) => group.id);
  const from = businessDateKeyToInstant(`${year}-01-01`);
  const to = businessDateKeyToInstant(`${year}-12-31`);
  const groups = await prisma.reportingGroup.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      name: true,
      active: true,
      properties: {
        select: { propertyId: true, effectiveFrom: true, effectiveTo: true },
      },
    },
    orderBy: { name: "asc" },
  });
  const effectiveByGroup = new Map(
    groups.map((group) => [
      group.id,
      reportingGroupPropertiesAt(group, to).map((row) => row.propertyId),
    ]),
  );
  const propertyIds = [...new Set([...effectiveByGroup.values()].flat())];
  const [q4Reports, annualReports, valuations, budgets, costs] =
    await Promise.all([
      prisma.quarterlyReport.findMany({
        where: {
          reportingGroupId: { in: groupIds },
          year,
          quarter: 4,
          status: "PUBLISHED",
        },
        select: {
          id: true,
          reportingGroupId: true,
          revision: true,
          asOfDate: true,
          propertyReports: { select: { propertyId: true } },
        },
        orderBy: { revision: "desc" },
      }),
      prisma.annualReport.findMany({
        where: { reportingGroupId: { in: groupIds }, year },
        select: {
          id: true,
          reportingGroupId: true,
          revision: true,
          status: true,
          founderLetter: true,
          executiveSummary: true,
          investmentThesis: true,
          valueCreationSummary: true,
          outlook: true,
          grossAssetValueCents: true,
          netAssetValueCents: true,
          debtCents: true,
          targetPortfolioValueCents: true,
          issuedShares: true,
          treasuryShares: true,
          sharePriceCents: true,
          teamSnapshot: true,
          groupStructureSnapshot: true,
          contactSnapshot: true,
          propertyReports: {
            select: {
              propertyId: true,
              propertyNameSnapshot: true,
              openingValueCents: true,
              currentValueCents: true,
              targetValueCents: true,
              investmentCase: true,
              valueCreationNarrative: true,
              outlook: true,
              sourceNote: true,
              mapLatitude: true,
              mapLongitude: true,
            },
          },
        },
        orderBy: { revision: "desc" },
      }),
      prisma.propertyValuationSnapshot.findMany({
        where: { propertyId: { in: propertyIds }, asOfDate: { lte: to } },
        select: { propertyId: true, asOfDate: true },
        orderBy: { asOfDate: "desc" },
      }),
      prisma.propertyBudgetLine.findMany({
        where: { propertyId: { in: propertyIds }, year },
        select: { propertyId: true },
        distinct: ["propertyId"],
      }),
      prisma.propertyCost.findMany({
        where: {
          propertyId: { in: propertyIds },
          status: "ACTUAL",
          effectiveAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          propertyId: true,
          annualReviewStatus: true,
          documents: {
            where: { deletedAt: null, category: "INVOICE" },
            select: { id: true },
            take: 1,
          },
        },
      }),
    ]);
  const q4ByGroup = new Map<string, (typeof q4Reports)[number]>();
  for (const report of q4Reports)
    if (!q4ByGroup.has(report.reportingGroupId))
      q4ByGroup.set(report.reportingGroupId, report);
  const annualByGroup = new Map<string, (typeof annualReports)[number]>();
  for (const report of annualReports)
    if (!annualByGroup.has(report.reportingGroupId))
      annualByGroup.set(report.reportingGroupId, report);
  const latestValuationByProperty = new Map<string, Date>();
  for (const valuation of valuations)
    if (!latestValuationByProperty.has(valuation.propertyId))
      latestValuationByProperty.set(valuation.propertyId, valuation.asOfDate);
  const budgeted = new Set(budgets.map((row) => row.propertyId));

  return groups.map((group) => {
    const scopedPropertyIds = effectiveByGroup.get(group.id) || [];
    const scoped = new Set(scopedPropertyIds);
    const q4 = q4ByGroup.get(group.id) || null;
    const annual = annualByGroup.get(group.id) || null;
    const annualMissing = annual ? annualReportMissingFields(annual) : [];
    const missingValuations = scopedPropertyIds.filter((propertyId) => {
      const asOf = latestValuationByProperty.get(propertyId);
      return !asOf || asOf < from;
    });
    const missingBudgets = scopedPropertyIds.filter(
      (propertyId) => !budgeted.has(propertyId),
    );
    const unresolvedCosts = costs.filter(
      (cost) =>
        scoped.has(cost.propertyId) &&
        (cost.documents.length === 0 ||
          !["CONFIRMED_BY_ACCOUNTANT", "EXCLUDED"].includes(
            cost.annualReviewStatus,
          )),
    );
    const q4ScopeMatches =
      Boolean(q4) &&
      q4!.propertyReports.length === scoped.size &&
      q4!.propertyReports.every((row) => scoped.has(row.propertyId));
    const tone = annualChecklistTone({
      propertyCount: scoped.size,
      hasPublishedQ4: Boolean(q4 && q4ScopeMatches),
      annualStatus: annual?.status || null,
      annualMissingCount: annualMissing.length,
      missingValuations: missingValuations.length,
      missingBudgets: missingBudgets.length,
      unresolvedCosts: unresolvedCosts.length,
    });
    return {
      id: group.id,
      name: group.name,
      active: group.active,
      year,
      propertyCount: scoped.size,
      tone,
      q4: q4
        ? { id: q4.id, revision: q4.revision, scopeMatches: q4ScopeMatches }
        : null,
      annual: annual
        ? {
            id: annual.id,
            revision: annual.revision,
            status: annual.status,
            missingCount: annualMissing.length,
            missingPreview: annualMissing.slice(0, 3),
          }
        : null,
      missingValuationCount: missingValuations.length,
      missingBudgetCount: missingBudgets.length,
      actualCostCount: costs.filter((cost) => scoped.has(cost.propertyId))
        .length,
      unresolvedCostCount: unresolvedCosts.length,
    };
  });
}
