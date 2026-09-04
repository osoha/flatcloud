import { LoanRateType } from "@prisma/client";
import { basisPointsFromPercent } from "@/lib/asset-finance";
import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

const rateTypes = new Set(Object.values(LoanRateType));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", "Nemáte oprávnění přidávat úvěry.");
  try {
    const form = await request.formData();
    const rateType = String(form.get("rateType") || "");
    if (!rateTypes.has(rateType as LoanRateType)) throw new Error("Vyberte platný typ úrokové sazby.");
    const principalCents = moneyToCents(form, "principal");
    const outstandingPrincipalCents = moneyToCents(form, "outstandingPrincipal");
    const monthlyDebtServiceCents = moneyToCents(form, "monthlyDebtService");
    if (principalCents <= 0) throw new Error("Původní jistina musí být vyšší než nula.");
    if (outstandingPrincipalCents < 0) throw new Error("Aktuální jistina nesmí být záporná.");
    const loan = await prisma.propertyLoan.create({ data: {
      propertyId: id,
      lender: text(form, "lender", true)!,
      label: text(form, "label", true)!,
      principalCents,
      outstandingPrincipalCents,
      annualInterestRateBps: basisPointsFromPercent(String(form.get("annualInterestRatePercent") || "")),
      rateType: rateType as LoanRateType,
      fixedUntil: dateValue(form, "fixedUntil"),
      maturityDate: dateValue(form, "maturityDate"),
      monthlyDebtServiceCents: monthlyDebtServiceCents > 0 ? monthlyDebtServiceCents : null,
      note: text(form, "note"),
    } });
    await audit(access.user.id, "PROPERTY_LOAN_CREATED", "PropertyLoan", loan.id, { lender: loan.lender, principalCents, outstandingPrincipalCents, annualInterestRateBps: loan.annualInterestRateBps }, id);
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "ok", "Úvěr byl přidán do asset finance.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", error instanceof Error ? error.message : "Úvěr se nepodařilo uložit.");
  }
}
