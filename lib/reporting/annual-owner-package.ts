import { prisma } from "@/lib/db";
import {
  businessDateEndInstant,
  businessDateKey,
  businessDateKeyToInstant,
} from "@/lib/calendar";
import {
  reportingPropertyAccessWhere,
  reportingScopeForUser,
  reportingUnitAccessWhere,
  type ReportingUser,
} from "@/lib/reporting/access";

export type AnnualPackageIssue = {
  code: string;
  severity: "BLOCKER" | "WARNING";
  message: string;
  href?: string;
};
export type AnnualIncomeRow = {
  id: string;
  bookedAt: Date;
  propertyId: string;
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  counterpartyName: string | null;
  variableSymbol: string | null;
  receivedCents: number;
  ownerShareBasisPoints: number;
  ownerAmountCents: number;
  rentCents: number;
  servicesCents: number;
  depositCents: number;
  otherCents: number;
  allocationNote: string;
};
export type AnnualExpenseEvidenceStatus =
  "ACCOUNTING_DOCUMENT" | "SUPPORT_ONLY" | "MISSING";
export type AnnualExpenseRow = {
  id: string;
  effectiveAt: Date;
  propertyId: string;
  propertyName: string;
  title: string;
  kind: string;
  category: string;
  documentNumber: string | null;
  sourceAmountCents: number;
  ownerShareBasisPoints: number | null;
  ownerAmountCents: number;
  allocationNote: string;
  documentCount: number;
  accountingDocumentCount: number;
  supportingDocumentCount: number;
  evidenceStatus: AnnualExpenseEvidenceStatus;
  annualReviewStatus: string;
  annualReviewNote: string | null;
  annualReviewedBy: string | null;
};
export type AnnualLoanRow = {
  id: string;
  propertyId: string;
  propertyName: string;
  label: string;
  lender: string;
  outstandingPrincipalCents: number;
  annualInterestRateBps: number;
  asOfDate: Date | null;
  evidence: string;
  interestPaidCents: number | null;
  reviewStatus: string;
  documentId: string | null;
  documentTitle: string | null;
  documentOptions: Array<{ id: string; title: string }>;
};
type OwnershipPeriodRow = {
  ownerId: string;
  shareBasisPoints: number;
  validFrom: Date;
  validTo: Date | null;
  owner: { id: string; name: string };
};

export function annualPackagePeriod(year: number, now = new Date()) {
  const today = businessDateKey(now),
    currentYear = Number(today.slice(0, 4)),
    closed = year < currentYear,
    toKey = closed ? `${year}-12-31` : today;
  return {
    from: businessDateKeyToInstant(`${year}-01-01`),
    to: businessDateEndInstant(toKey as `${number}-${number}-${number}`),
    toKey,
    closed,
    mode: closed ? ("CLOSED" as const) : ("YTD" as const),
  };
}
export function normalizeAnnualPackageYear(
  value: string | undefined,
  now = new Date(),
) {
  const currentYear = Number(businessDateKey(now).slice(0, 4)),
    previousYear = currentYear - 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= currentYear
    ? parsed
    : previousYear;
}
function proportional(amountCents: number | bigint, basisPoints: number) {
  const amount = Number(amountCents);
  if (!Number.isSafeInteger(amount))
    throw new Error("Jistina je mimo bezpečný rozsah reportu.");
  return Math.round((amount * basisPoints) / 10_000);
}
export function classifyAnnualExpenseEvidence(categories: string[]) {
  const accountingDocumentCount = categories.filter(
    (category) => category === "INVOICE",
  ).length;
  const supportingDocumentCount = categories.length - accountingDocumentCount;
  const evidenceStatus: AnnualExpenseEvidenceStatus = accountingDocumentCount
    ? "ACCOUNTING_DOCUMENT"
    : supportingDocumentCount
      ? "SUPPORT_ONLY"
      : "MISSING";
  return { accountingDocumentCount, supportingDocumentCount, evidenceStatus };
}
export function missingAnnualExpenseEvidenceSeverity(
  closed: boolean,
): AnnualPackageIssue["severity"] {
  return closed ? "BLOCKER" : "WARNING";
}
export function resolveAnnualOwnershipShare(
  periods: Array<{
    ownerId: string;
    shareBasisPoints: number;
    validFrom: Date;
    validTo: Date | null;
  }>,
  ownerId: string,
  at: Date,
  fallback: number,
) {
  const active = periods.filter(
    (period) =>
      period.validFrom <= at && (!period.validTo || period.validTo >= at),
  );
  const totalBasisPoints = active.reduce(
    (sum, period) => sum + period.shareBasisPoints,
    0,
  );
  return totalBasisPoints === 10_000 && active.length > 0
    ? {
        shareBasisPoints:
          active.find((period) => period.ownerId === ownerId)
            ?.shareBasisPoints || 0,
        complete: true,
        totalBasisPoints,
      }
    : { shareBasisPoints: fallback, complete: false, totalBasisPoints };
}

export async function loadAnnualOwnerPackage(
  user: ReportingUser,
  input: { ownerId?: string; year: number },
) {
  const range = annualPackagePeriod(input.year);
  const scope = reportingScopeForUser(user),
    propertyWhere = reportingPropertyAccessWhere(scope),
    unitWhere = reportingUnitAccessWhere(scope);
  const properties = await prisma.property.findMany({
    where: propertyWhere,
    select: {
      id: true,
      name: true,
      address: true,
      ownershipMode: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
      ownerships: {
        select: {
          ownerId: true,
          shareBasisPoints: true,
          owner: { select: { id: true, name: true } },
        },
      },
      ownershipPeriods: {
        where: {
          validFrom: { lte: range.to },
          OR: [{ validTo: null }, { validTo: { gte: range.from } }],
        },
        select: {
          id: true,
          ownerId: true,
          shareBasisPoints: true,
          validFrom: true,
          validTo: true,
          owner: { select: { id: true, name: true } },
        },
      },
      units: {
        where: unitWhere,
        select: {
          id: true,
          label: true,
          ownerships: {
            select: {
              ownerId: true,
              shareBasisPoints: true,
              owner: { select: { id: true, name: true } },
            },
          },
          ownershipPeriods: {
            where: {
              validFrom: { lte: range.to },
              OR: [{ validTo: null }, { validTo: { gte: range.from } }],
            },
            select: {
              id: true,
              ownerId: true,
              shareBasisPoints: true,
              validFrom: true,
              validTo: true,
              owner: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const wholePropertyIds =
      scope.mode === "ALL"
        ? properties.map((property) => property.id)
        : scope.wholePropertyIds,
    wholePropertyIdSet = new Set(wholePropertyIds);
  const propertyIds = properties.map((property) => property.id),
    unitIds = properties.flatMap((property) =>
      property.units.map((unit) => unit.id),
    );
  const ownerMap = new Map<string, string>();
  for (const property of properties) {
    if (wholePropertyIdSet.has(property.id)) {
      for (const ownership of property.ownerships)
        ownerMap.set(ownership.owner.id, ownership.owner.name);
      for (const period of property.ownershipPeriods)
        ownerMap.set(period.owner.id, period.owner.name);
      if (
        !property.ownerships.length &&
        property.ownershipMode === "WHOLE_OBJECT"
      )
        ownerMap.set(property.owner.id, property.owner.name);
    }
    for (const unit of property.units) {
      for (const ownership of unit.ownerships)
        ownerMap.set(ownership.owner.id, ownership.owner.name);
      for (const period of unit.ownershipPeriods)
        ownerMap.set(period.owner.id, period.owner.name);
    }
  }
  const owners = [...ownerMap]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const selectedOwner =
    owners.find((owner) => owner.id === input.ownerId) || null;
  if (!selectedOwner || !propertyIds.length || !unitIds.length)
    return emptyPackage(input.year, owners, selectedOwner, range);

  const costAccess =
    scope.mode === "ALL"
      ? { propertyId: { in: propertyIds } }
      : {
          OR: [
            ...(scope.wholePropertyIds.length
              ? [{ propertyId: { in: scope.wholePropertyIds } }]
              : []),
            ...(scope.unitIds.length
              ? [
                  { unitId: { in: scope.unitIds } },
                  { allocations: { some: { unitId: { in: scope.unitIds } } } },
                ]
              : []),
          ],
        };
  const [paymentAllocations, costs, loans] = await Promise.all([
    prisma.paymentAllocation.findMany({
      where: {
        amountCents: { gt: 0 },
        transaction: { bookedAt: { gte: range.from, lte: range.to } },
        charge: { lease: { unitId: { in: unitIds } } },
      },
      select: {
        id: true,
        amountCents: true,
        transaction: {
          select: {
            bookedAt: true,
            counterpartyName: true,
            variableSymbol: true,
          },
        },
        charge: {
          select: {
            amountCents: true,
            items: { select: { category: true, amountCents: true } },
            lease: {
              select: {
                tenant: { select: { name: true } },
                unit: {
                  select: {
                    id: true,
                    label: true,
                    property: {
                      select: {
                        id: true,
                        name: true,
                        ownershipMode: true,
                        ownerId: true,
                        ownerships: {
                          select: { ownerId: true, shareBasisPoints: true },
                        },
                        ownershipPeriods: {
                          select: {
                            ownerId: true,
                            shareBasisPoints: true,
                            validFrom: true,
                            validTo: true,
                            owner: { select: { id: true, name: true } },
                          },
                        },
                      },
                    },
                    ownerships: {
                      select: { ownerId: true, shareBasisPoints: true },
                    },
                    ownershipPeriods: {
                      select: {
                        ownerId: true,
                        shareBasisPoints: true,
                        validFrom: true,
                        validTo: true,
                        owner: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ transaction: { bookedAt: "asc" } }, { id: "asc" }],
    }),
    prisma.propertyCost.findMany({
      where: {
        ...costAccess,
        status: "ACTUAL",
        effectiveAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        propertyId: true,
        title: true,
        kind: true,
        category: true,
        amountCents: true,
        effectiveAt: true,
        documentNumber: true,
        unitId: true,
        annualReviewStatus: true,
        annualReviewNote: true,
        annualReviewedBy: { select: { name: true } },
        property: {
          select: {
            id: true,
            name: true,
            ownershipMode: true,
            ownerId: true,
            ownerships: { select: { ownerId: true, shareBasisPoints: true } },
            ownershipPeriods: {
              select: {
                ownerId: true,
                shareBasisPoints: true,
                validFrom: true,
                validTo: true,
                owner: { select: { id: true, name: true } },
              },
            },
          },
        },
        unit: {
          select: {
            id: true,
            label: true,
            ownerships: { select: { ownerId: true, shareBasisPoints: true } },
            ownershipPeriods: {
              select: {
                ownerId: true,
                shareBasisPoints: true,
                validFrom: true,
                validTo: true,
                owner: { select: { id: true, name: true } },
              },
            },
          },
        },
        allocations: {
          where: scope.mode === "ALL" ? undefined : { unitId: { in: unitIds } },
          select: {
            amountCents: true,
            unit: {
              select: {
                id: true,
                label: true,
                ownerships: {
                  select: { ownerId: true, shareBasisPoints: true },
                },
                ownershipPeriods: {
                  select: {
                    ownerId: true,
                    shareBasisPoints: true,
                    validFrom: true,
                    validTo: true,
                    owner: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        documents: {
          where: { deletedAt: null },
          select: { id: true, category: true },
        },
      },
      orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
    }),
    prisma.propertyLoan.findMany({
      where: { propertyId: { in: wholePropertyIds }, active: true },
      select: {
        id: true,
        propertyId: true,
        label: true,
        lender: true,
        outstandingPrincipalCents: true,
        annualInterestRateBps: true,
        property: {
          select: {
            name: true,
            ownershipMode: true,
            ownerId: true,
            ownerships: { select: { ownerId: true, shareBasisPoints: true } },
            ownershipPeriods: {
              select: {
                ownerId: true,
                shareBasisPoints: true,
                validFrom: true,
                validTo: true,
                owner: { select: { id: true, name: true } },
              },
            },
            documents: {
              where: { deletedAt: null, category: "INVOICE" },
              select: { id: true, title: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        snapshots: {
          where: { asOfDate: { lte: range.to } },
          orderBy: { asOfDate: "desc" },
          take: 1,
          select: {
            asOfDate: true,
            outstandingPrincipalCents: true,
            annualInterestRateBps: true,
          },
        },
        annualEvidence: {
          where: { year: input.year },
          take: 1,
          select: {
            interestPaidCents: true,
            reviewStatus: true,
            documentId: true,
            document: { select: { title: true } },
          },
        },
      },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    }),
  ]);

  const issues: AnnualPackageIssue[] = !range.closed
    ? [
        {
          code: "OPEN_ANNUAL_PERIOD",
          severity: "BLOCKER",
          message: `Rok ${input.year} není uzavřený. Podklady jsou průběžné pouze do ${range.toKey} a nesmí být označené jako finální roční balíček.`,
        },
      ]
    : [];
  const ownershipIssueKeys = new Set<string>();
  const resolvePeriodShare = (
    scopeKey: string,
    label: string,
    periods: OwnershipPeriodRow[],
    at: Date,
    fallback: number,
  ) => {
    const resolved = resolveAnnualOwnershipShare(
      periods,
      selectedOwner.id,
      at,
      fallback,
    );
    if (resolved.complete)
      return { share: resolved.shareBasisPoints, historical: true };
    if (!ownershipIssueKeys.has(scopeKey)) {
      ownershipIssueKeys.add(scopeKey);
      issues.push({
        code: `OWNERSHIP_HISTORY:${scopeKey}`,
        severity: range.closed ? "BLOCKER" : "WARNING",
        message: `${label}: k rozhodnému datu chybí úplná historická vlastnická struktura se součtem 100 %. Výpočet dočasně používá současný stav.`,
      });
    }
    return { share: resolved.shareBasisPoints, historical: false };
  };
  const propertyFallback = (property: {
    ownerId: string;
    ownerships: Array<{ ownerId: string; shareBasisPoints: number }>;
  }) =>
    property.ownerships.find((row) => row.ownerId === selectedOwner.id)
      ?.shareBasisPoints ??
    (property.ownerId === selectedOwner.id ? 10_000 : 0);
  const ownerShareForUnit = (
    unit: {
      id: string;
      label?: string;
      ownerships: Array<{ ownerId: string; shareBasisPoints: number }>;
      ownershipPeriods: OwnershipPeriodRow[];
      property: {
        id: string;
        name: string;
        ownershipMode: string;
        ownerId: string;
        ownerships: Array<{ ownerId: string; shareBasisPoints: number }>;
        ownershipPeriods: OwnershipPeriodRow[];
      };
    },
    at: Date,
  ) => {
    if (
      unit.ownershipPeriods.length ||
      unit.property.ownershipMode !== "WHOLE_OBJECT"
    ) {
      const fallback =
        unit.ownerships.find((row) => row.ownerId === selectedOwner.id)
          ?.shareBasisPoints || 0;
      return resolvePeriodShare(
        `unit:${unit.id}`,
        `${unit.property.name} · ${unit.label || "jednotka"}`,
        unit.ownershipPeriods,
        at,
        fallback,
      );
    }
    return resolvePeriodShare(
      `property:${unit.property.id}`,
      unit.property.name,
      unit.property.ownershipPeriods,
      at,
      propertyFallback(unit.property),
    );
  };
  let missingChargeItems = false;
  const incomeRows: AnnualIncomeRow[] = paymentAllocations.flatMap(
    (allocation) => {
      const resolved = ownerShareForUnit(
          allocation.charge.lease.unit,
          allocation.transaction.bookedAt,
        ),
        share = resolved.share;
      if (!share) return [];
      const ownerAmountCents = proportional(allocation.amountCents, share),
        chargeAmount = allocation.charge.amountCents;
      const byCategory = (categories: string[]) =>
        allocation.charge.items
          .filter((item) => categories.includes(item.category))
          .reduce((sum, item) => sum + item.amountCents, 0);
      const allocateCategory = (sourceCents: number) =>
        chargeAmount > 0
          ? Math.round((ownerAmountCents * sourceCents) / chargeAmount)
          : 0;
      if (!allocation.charge.items.length) missingChargeItems = true;
      const rentCents = allocateCategory(byCategory(["RENT"])),
        depositCents = allocateCategory(byCategory(["DEPOSIT"])),
        servicesCents = allocateCategory(
          byCategory(["WATER", "HEATING", "ELECTRICITY", "SERVICES"]),
        );
      return [
        {
          id: allocation.id,
          bookedAt: allocation.transaction.bookedAt,
          propertyId: allocation.charge.lease.unit.property.id,
          propertyName: allocation.charge.lease.unit.property.name,
          unitLabel: allocation.charge.lease.unit.label,
          tenantName: allocation.charge.lease.tenant.name,
          counterpartyName: allocation.transaction.counterpartyName,
          variableSymbol: allocation.transaction.variableSymbol,
          receivedCents: allocation.amountCents,
          ownerShareBasisPoints: share,
          ownerAmountCents,
          rentCents,
          servicesCents,
          depositCents,
          otherCents:
            ownerAmountCents - rentCents - depositCents - servicesCents,
          allocationNote: `${(share / 100).toLocaleString("cs-CZ")} % · ${resolved.historical ? "historie k datu úhrady" : "dočasně současný stav"}`,
        },
      ];
    },
  );
  if (missingChargeItems)
    issues.push({
      code: "MISSING_CHARGE_ITEMS",
      severity: "WARNING",
      message:
        "Některá přijatá úhrada nemá rozpad předpisu. Částka je v přehledu, ale její věcná kategorie zůstává v poli Ostatní.",
    });

  const expenseRows: AnnualExpenseRow[] = [];
  for (const cost of costs) {
    let ownerAmountCents = 0,
      ownerShareBasisPoints: number | null = null,
      allocationNote = "";
    if (cost.allocations.length) {
      let historical = true;
      ownerAmountCents = cost.allocations.reduce((sum, item) => {
        const resolved = ownerShareForUnit(
          { ...item.unit, property: cost.property },
          cost.effectiveAt,
        );
        historical &&= resolved.historical;
        return sum + proportional(item.amountCents, resolved.share);
      }, 0);
      allocationNote = `Uložené rozdělení na jednotky × ${historical ? "historický podíl k datu" : "dočasně současný podíl"}`;
    } else if (cost.unit) {
      const resolved = ownerShareForUnit(
        { ...cost.unit, property: cost.property },
        cost.effectiveAt,
      );
      ownerShareBasisPoints = resolved.share;
      ownerAmountCents = proportional(cost.amountCents, resolved.share);
      allocationNote = `Přímý náklad jednotky × ${resolved.historical ? "historický podíl k datu" : "dočasně současný podíl"}`;
    } else if (cost.property.ownershipMode === "WHOLE_OBJECT") {
      const resolved = resolvePeriodShare(
        `property:${cost.property.id}`,
        cost.property.name,
        cost.property.ownershipPeriods,
        cost.effectiveAt,
        propertyFallback(cost.property),
      );
      ownerShareBasisPoints = resolved.share;
      ownerAmountCents = proportional(cost.amountCents, resolved.share);
      allocationNote = `Náklad objektu × ${resolved.historical ? "historický podíl k datu" : "dočasně současný podíl"}`;
    } else
      issues.push({
        code: `UNALLOCATED_COST:${cost.id}`,
        severity: "BLOCKER",
        message: `${cost.property.name}: náklad „${cost.title}“ není rozdělený na jednotky, proto jej nelze přiřadit vlastníkovi.`,
        href: `/nemovitosti/${cost.propertyId}/naklady/${cost.id}`,
      });
    if (!ownerAmountCents) continue;
    const { accountingDocumentCount, supportingDocumentCount, evidenceStatus } =
      classifyAnnualExpenseEvidence(
        cost.documents.map((document) => document.category),
      );
    if (!accountingDocumentCount)
      issues.push({
        code: `MISSING_ACCOUNTING_DOCUMENT:${cost.id}`,
        severity: missingAnnualExpenseEvidenceSeverity(range.closed),
        message: supportingDocumentCount
          ? `${cost.property.name}: náklad „${cost.title}“ má pouze podpůrnou přílohu. Pro skutečný výdaj doplňte fakturu nebo účetní doklad.`
          : `${cost.property.name}: náklad „${cost.title}“ nemá připojenou fakturu ani účetní doklad.`,
        href: `/nemovitosti/${cost.propertyId}/naklady/${cost.id}`,
      });
    if (
      cost.annualReviewStatus !== "CONFIRMED_BY_ACCOUNTANT" &&
      cost.annualReviewStatus !== "EXCLUDED"
    )
      issues.push({
        code: `COST_REVIEW:${cost.id}`,
        severity: range.closed ? "BLOCKER" : "WARNING",
        message: `${cost.property.name}: odborná účetní kontrola klasifikace nákladu „${cost.title}“ není potvrzena.`,
        href: `/reporty/rocni-podklady?ownerId=${selectedOwner.id}&year=${input.year}#cost-${cost.id}`,
      });
    expenseRows.push({
      id: cost.id,
      effectiveAt: cost.effectiveAt,
      propertyId: cost.propertyId,
      propertyName: cost.property.name,
      title: cost.title,
      kind: cost.kind,
      category: cost.category,
      documentNumber: cost.documentNumber,
      sourceAmountCents: cost.amountCents,
      ownerShareBasisPoints,
      ownerAmountCents,
      allocationNote,
      documentCount: cost.documents.length,
      accountingDocumentCount,
      supportingDocumentCount,
      evidenceStatus,
      annualReviewStatus: cost.annualReviewStatus,
      annualReviewNote: cost.annualReviewNote,
      annualReviewedBy: cost.annualReviewedBy?.name || null,
    });
  }
  const loanRows: AnnualLoanRow[] = loans.flatMap((loan) => {
    if (loan.property.ownershipMode !== "WHOLE_OBJECT") return [];
    const resolved = resolvePeriodShare(
        `property:${loan.propertyId}`,
        loan.property.name,
        loan.property.ownershipPeriods,
        range.to,
        propertyFallback(loan.property),
      ),
      snapshot = loan.snapshots[0],
      annualEvidence = loan.annualEvidence[0];
    if (!resolved.share || !snapshot) return [];
    const confirmed =
      annualEvidence?.reviewStatus === "CONFIRMED_BY_ACCOUNTANT" &&
      Boolean(annualEvidence.document);
    if (!confirmed)
      issues.push({
        code: `LOAN_INTEREST_SOURCE:${loan.id}`,
        severity: range.closed ? "BLOCKER" : "WARNING",
        message: `${loan.property.name}: zaplacený úrok za ${input.year} nemá potvrzenou roční evidenci s účetním dokladem.`,
        href: `/reporty/rocni-podklady?ownerId=${selectedOwner.id}&year=${input.year}#loan-${loan.id}`,
      });
    return [
      {
        id: loan.id,
        propertyId: loan.propertyId,
        propertyName: loan.property.name,
        label: loan.label,
        lender: loan.lender,
        outstandingPrincipalCents: proportional(
          snapshot.outstandingPrincipalCents,
          resolved.share,
        ),
        annualInterestRateBps: snapshot.annualInterestRateBps,
        asOfDate: snapshot.asOfDate,
        evidence: confirmed
          ? `Potvrzeno účetním · ${annualEvidence.document?.title}`
          : "Sazba a jistina nejsou dokladem zaplaceného úroku",
        interestPaidCents: annualEvidence
          ? proportional(annualEvidence.interestPaidCents, resolved.share)
          : null,
        reviewStatus: annualEvidence?.reviewStatus || "DRAFT",
        documentId: annualEvidence?.documentId || null,
        documentTitle: annualEvidence?.document?.title || null,
        documentOptions: loan.property.documents,
      },
    ];
  });
  const incomeCents = incomeRows.reduce(
      (sum, row) => sum + row.ownerAmountCents,
      0,
    ),
    rentIncomeCents = incomeRows.reduce((sum, row) => sum + row.rentCents, 0),
    servicesIncomeCents = incomeRows.reduce(
      (sum, row) => sum + row.servicesCents,
      0,
    ),
    depositIncomeCents = incomeRows.reduce(
      (sum, row) => sum + row.depositCents,
      0,
    ),
    expenseCents = expenseRows.reduce(
      (sum, row) => sum + row.ownerAmountCents,
      0,
    ),
    documentedExpenseCents = expenseRows
      .filter((row) => row.accountingDocumentCount > 0)
      .reduce((sum, row) => sum + row.ownerAmountCents, 0),
    supportedOnlyExpenseCents = expenseRows
      .filter((row) => row.evidenceStatus === "SUPPORT_ONLY")
      .reduce((sum, row) => sum + row.ownerAmountCents, 0),
    interestPaidCents = loanRows.reduce(
      (sum, row) => sum + (row.interestPaidCents || 0),
      0,
    );
  const ownershipPeriods = properties
    .flatMap((property) => [
      ...property.ownershipPeriods.map((period) => ({
        scope: "Nemovitost",
        scopeLabel: property.name,
        ...period,
      })),
      ...property.units.flatMap((unit) =>
        unit.ownershipPeriods.map((period) => ({
          scope: "Jednotka",
          scopeLabel: `${property.name} · ${unit.label}`,
          ...period,
        })),
      ),
    ])
    .filter((period) => period.ownerId === selectedOwner.id);
  const editorScopes = properties.map((property) => ({
    id: property.id,
    name: property.name,
    units: property.units.map((unit) => ({ id: unit.id, label: unit.label })),
  }));
  return {
    year: input.year,
    periodMode: range.mode,
    dataThrough: range.toKey,
    owners,
    selectedOwner,
    incomeRows,
    expenseRows,
    loanRows,
    ownershipPeriods,
    editorScopes,
    issues,
    totals: {
      incomeCents,
      rentIncomeCents,
      servicesIncomeCents,
      depositIncomeCents,
      expenseCents,
      differenceCents: incomeCents - depositIncomeCents - expenseCents,
      documentedExpenseCents,
      supportedOnlyExpenseCents,
      interestPaidCents,
    },
    ready: !issues.some((issue) => issue.severity === "BLOCKER"),
  };
}

function emptyPackage(
  year: number,
  owners: Array<{ id: string; name: string }>,
  selectedOwner: { id: string; name: string } | null,
  range: ReturnType<typeof annualPackagePeriod>,
) {
  return {
    year,
    periodMode: range.mode,
    dataThrough: range.toKey,
    owners,
    selectedOwner,
    incomeRows: [] as AnnualIncomeRow[],
    expenseRows: [] as AnnualExpenseRow[],
    loanRows: [] as AnnualLoanRow[],
    ownershipPeriods: [],
    editorScopes: [],
    issues: [] as AnnualPackageIssue[],
    totals: {
      incomeCents: 0,
      rentIncomeCents: 0,
      servicesIncomeCents: 0,
      depositIncomeCents: 0,
      expenseCents: 0,
      differenceCents: 0,
      documentedExpenseCents: 0,
      supportedOnlyExpenseCents: 0,
      interestPaidCents: 0,
    },
    ready: false,
  };
}
