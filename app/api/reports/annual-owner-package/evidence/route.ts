import { ownerVisibleDocumentWhere } from "@/lib/documents/access";
import { AnnualReviewStatus } from "@prisma/client";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { shareBasisPointsFromPercent } from "@/lib/property-cost-allocations";
import { goWithMessage } from "@/lib/route-response";

const statuses = new Set(Object.values(AnnualReviewStatus));

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const ownerId = text(form, "returnOwnerId");
  const year = Number(form.get("returnYear"));
  const returnTo = `/reporty/rocni-podklady?${new URLSearchParams({ ...(ownerId ? { ownerId } : {}), ...(Number.isInteger(year) ? { year: String(year) } : {}) })}`;
  if (!hasAllPropertyAccess(user))
    return goWithMessage(
      request,
      returnTo,
      "error",
      "Roční evidenci může potvrzovat pouze globální správce.",
    );
  try {
    const mode = text(form, "mode", true);
    if (mode === "ownership") {
      const propertyId = text(form, "propertyId", true)!;
      const unitId = text(form, "unitId");
      const periodOwnerId = text(form, "ownerId", true)!;
      const validFrom = dateValue(form, "validFrom", true)!;
      const validTo = dateValue(form, "validTo");
      const shareBasisPoints = shareBasisPointsFromPercent(
        text(form, "sharePercent", true)!,
      );
      const sourceNote = text(form, "sourceNote");
      if (validTo && validTo < validFrom)
        throw new Error("Konec účinnosti nesmí být před začátkem.");
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true },
      });
      if (!property) throw new Error("Nemovitost nebyla nalezena.");
      if (
        unitId &&
        !(await prisma.unit.findFirst({
          where: { id: unitId, propertyId },
          select: { id: true },
        }))
      )
        throw new Error("Jednotka nepatří do vybrané nemovitosti.");
      if (
        !(await prisma.owner.findUnique({
          where: { id: periodOwnerId },
          select: { id: true },
        }))
      )
        throw new Error("Vlastník nebyl nalezen.");
      const scopeKey = unitId ? `unit:${unitId}` : `property:${propertyId}`;
      const overlap = await prisma.ownershipPeriod.findFirst({
        where: {
          scopeKey,
          ownerId: periodOwnerId,
          validFrom: { lte: validTo || new Date("9999-12-31T12:00:00Z") },
          OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
        },
      });
      const repeatsSamePeriod =
        overlap &&
        overlap.shareBasisPoints === shareBasisPoints &&
        overlap.validFrom.getTime() === validFrom.getTime() &&
        (overlap.validTo?.getTime() ?? null) === (validTo?.getTime() ?? null) &&
        (overlap.sourceNote || null) === (sourceNote || null);
      if (repeatsSamePeriod)
        return goWithMessage(
          request,
          returnTo,
          "ok",
          "Historicky účinný vlastnický podíl byl uložen.",
        );
      if (overlap)
        throw new Error(
          "Pro tohoto vlastníka už existuje překrývající se období.",
        );
      const created = await prisma.ownershipPeriod.create({
        data: {
          scopeKey,
          propertyId,
          unitId,
          ownerId: periodOwnerId,
          shareBasisPoints,
          validFrom,
          validTo,
          sourceNote,
          confirmedById: user.id,
        },
      });
      await audit(
        user.id,
        "ANNUAL_OWNERSHIP_PERIOD_CONFIRMED",
        "OwnershipPeriod",
        created.id,
        { scopeKey, periodOwnerId, shareBasisPoints, validFrom, validTo },
        propertyId,
      );
      return goWithMessage(
        request,
        returnTo,
        "ok",
        "Historicky účinný vlastnický podíl byl uložen.",
      );
    }
    if (mode === "ownership-delete") {
      const periodId = text(form, "periodId", true)!;
      const period = await prisma.ownershipPeriod.findUnique({
        where: { id: periodId },
        select: {
          id: true,
          propertyId: true,
          ownerId: true,
          scopeKey: true,
          validFrom: true,
          validTo: true,
        },
      });
      if (!period) throw new Error("Vlastnické období nebylo nalezeno.");
      await prisma.ownershipPeriod.delete({ where: { id: period.id } });
      await audit(
        user.id,
        "ANNUAL_OWNERSHIP_PERIOD_REMOVED",
        "OwnershipPeriod",
        period.id,
        {
          ownerId: period.ownerId,
          scopeKey: period.scopeKey,
          validFrom: period.validFrom,
          validTo: period.validTo,
        },
        period.propertyId,
      );
      return goWithMessage(
        request,
        returnTo,
        "ok",
        "Historicky účinný vlastnický podíl byl odebrán.",
      );
    }
    if (mode === "loan-interest") {
      const loanId = text(form, "loanId", true)!;
      const evidenceYear = Number(form.get("year"));
      const interestPaidCents = moneyToCents(form, "interestPaid");
      const reviewStatus = text(
        form,
        "reviewStatus",
        true,
      )! as AnnualReviewStatus;
      if (
        !Number.isInteger(evidenceYear) ||
        evidenceYear < 2000 ||
        evidenceYear > 2200
      )
        throw new Error("Vyberte platný rok.");
      if (interestPaidCents < 0 || !statuses.has(reviewStatus))
        throw new Error("Zkontrolujte částku a stav kontroly úroku.");
      const loan = await prisma.propertyLoan.findUnique({
        where: { id: loanId },
        select: { propertyId: true },
      });
      if (!loan) throw new Error("Úvěr nebyl nalezen.");
      const documentId = text(form, "documentId");
      if (
        documentId &&
        !(await prisma.document.findFirst({
          where: {
            id: documentId,
            AND: [ownerVisibleDocumentWhere],
            propertyId: loan.propertyId,
            deletedAt: null,
          },
          select: { id: true },
        }))
      )
        throw new Error("Doklad nepatří k nemovitosti úvěru.");
      const reviewed = reviewStatus === "CONFIRMED_BY_ACCOUNTANT";
      const saved = await prisma.propertyLoanAnnualEvidence.upsert({
        where: { loanId_year: { loanId, year: evidenceYear } },
        create: {
          loanId,
          year: evidenceYear,
          interestPaidCents: BigInt(interestPaidCents),
          documentId,
          reviewStatus,
          note: text(form, "note"),
          reviewedById: reviewed ? user.id : null,
          reviewedAt: reviewed ? new Date() : null,
        },
        update: {
          interestPaidCents: BigInt(interestPaidCents),
          documentId,
          reviewStatus,
          note: text(form, "note"),
          reviewedById: reviewed ? user.id : null,
          reviewedAt: reviewed ? new Date() : null,
        },
      });
      await audit(
        user.id,
        "ANNUAL_LOAN_INTEREST_EVIDENCE_UPDATED",
        "PropertyLoanAnnualEvidence",
        saved.id,
        { loanId, evidenceYear, interestPaidCents, reviewStatus, documentId },
        loan.propertyId,
      );
      return goWithMessage(
        request,
        returnTo,
        "ok",
        "Roční evidence zaplaceného úroku byla uložena.",
      );
    }
    if (mode === "cost-review") {
      const costId = text(form, "costId", true)!;
      const reviewStatus = text(
        form,
        "reviewStatus",
        true,
      )! as AnnualReviewStatus;
      if (!statuses.has(reviewStatus))
        throw new Error("Vyberte platný stav odborné kontroly.");
      const cost = await prisma.propertyCost.findUnique({
        where: { id: costId },
        select: { propertyId: true },
      });
      if (!cost) throw new Error("Náklad nebyl nalezen.");
      const reviewed = reviewStatus === "CONFIRMED_BY_ACCOUNTANT";
      await prisma.propertyCost.update({
        where: { id: costId },
        data: {
          annualReviewStatus: reviewStatus,
          annualReviewNote: text(form, "note"),
          annualReviewedById: reviewed ? user.id : null,
          annualReviewedAt: reviewed ? new Date() : null,
        },
      });
      await audit(
        user.id,
        "ANNUAL_COST_REVIEW_UPDATED",
        "PropertyCost",
        costId,
        { reviewStatus },
        cost.propertyId,
      );
      return goWithMessage(
        request,
        returnTo,
        "ok",
        "Stav odborné kontroly nákladu byl uložen.",
      );
    }
    throw new Error("Neznámý typ roční evidence.");
  } catch (error) {
    return goWithMessage(
      request,
      returnTo,
      "error",
      error instanceof Error
        ? error.message
        : "Roční evidenci se nepodařilo uložit.",
    );
  }
}
