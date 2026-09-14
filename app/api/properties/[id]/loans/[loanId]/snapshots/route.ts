import { assertAssetDateNotFuture, basisPointsFromPercent } from "@/lib/asset-finance";
import { prisma } from "@/lib/db";
import { serializableTransaction } from "@/lib/serializable";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty } from "@/lib/management";
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
    const asOfDate = assertAssetDateNotFuture(dateValue(form, "asOfDate", true)!);
    if (outstandingPrincipalCents < 0) throw new Error("Aktuální jistina nesmí být záporná.");
    if (monthlyDebtServiceCents < 0) throw new Error("Měsíční splátka nesmí být záporná.");
    const note = text(form, "note");
    await serializableTransaction(async (tx) => {
      const created = await tx.propertyLoanSnapshot.create({ data: {
        loanId,
        asOfDate,
        outstandingPrincipalCents: BigInt(outstandingPrincipalCents),
        annualInterestRateBps,
        monthlyDebtServiceCents: monthlyDebtServiceCents > 0 ? BigInt(monthlyDebtServiceCents) : null,
        note,
      } });
      // A backdated entry must not replace a newer confirmed state. Future legacy
      // snapshots remain preserved but cannot populate the current cache.
      const latest = await tx.propertyLoanSnapshot.findFirstOrThrow({ where: { loanId, asOfDate: { lte: assertAssetDateNotFuture(new Date()) } }, orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
      await tx.propertyLoan.update({ where: { id: loanId }, data: {
        outstandingPrincipalCents: latest.outstandingPrincipalCents,
        annualInterestRateBps: latest.annualInterestRateBps,
        monthlyDebtServiceCents: latest.monthlyDebtServiceCents,
      } });
      await tx.auditLog.create({ data: { userId: access.user.id, action: "PROPERTY_LOAN_SNAPSHOT_CREATED", entityType: "PropertyLoanSnapshot", entityId: created.id, propertyId: id, details: { loanId, asOfDate: asOfDate.toISOString(), outstandingPrincipalCents, annualInterestRateBps, monthlyDebtServiceCents } } });
    });
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "ok", "Nový stav úvěru byl uložen do historie.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", error instanceof Error ? error.message : "Stav úvěru se nepodařilo uložit.");
  }
}
