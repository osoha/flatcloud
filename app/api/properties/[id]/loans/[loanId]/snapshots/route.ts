import { basisPointsFromPercent } from "@/lib/asset-finance";
import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; loanId: string }> }) {
  const { id, loanId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", "Nemáte oprávnění aktualizovat stav úvěru.");
  try {
    const loan = await prisma.propertyLoan.findFirst({ where: { id: loanId, propertyId: id } });
    if (!loan) throw new Error("Úvěr v této nemovitosti nebyl nalezen.");
    const form = await request.formData();
    const outstandingPrincipalCents = moneyToCents(form, "outstandingPrincipal");
    const monthlyDebtServiceCents = moneyToCents(form, "monthlyDebtService");
    const annualInterestRateBps = basisPointsFromPercent(String(form.get("annualInterestRatePercent") || ""));
    const asOfDate = dateValue(form, "asOfDate", true)!;
    if (outstandingPrincipalCents < 0) throw new Error("Aktuální jistina nesmí být záporná.");
    if (monthlyDebtServiceCents < 0) throw new Error("Měsíční splátka nesmí být záporná.");
    const note = text(form, "note");
    const snapshot = await prisma.$transaction(async (tx) => {
      const created = await tx.propertyLoanSnapshot.create({ data: {
        loanId,
        asOfDate,
        outstandingPrincipalCents,
        annualInterestRateBps,
        monthlyDebtServiceCents: monthlyDebtServiceCents > 0 ? monthlyDebtServiceCents : null,
        note,
      } });
      await tx.propertyLoan.update({ where: { id: loanId }, data: {
        outstandingPrincipalCents,
        annualInterestRateBps,
        monthlyDebtServiceCents: monthlyDebtServiceCents > 0 ? monthlyDebtServiceCents : null,
      } });
      return created;
    });
    await audit(access.user.id, "PROPERTY_LOAN_SNAPSHOT_CREATED", "PropertyLoanSnapshot", snapshot.id, { loanId, asOfDate: asOfDate.toISOString(), outstandingPrincipalCents, annualInterestRateBps, monthlyDebtServiceCents }, id);
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "ok", "Nový stav úvěru byl uložen do historie.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", error instanceof Error ? error.message : "Stav úvěru se nepodařilo uložit.");
  }
}
