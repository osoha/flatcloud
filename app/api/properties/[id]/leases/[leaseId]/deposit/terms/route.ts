import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { leaseAccessWhere, editableUnitWhere } from "@/lib/access";
import { audit } from "@/lib/management";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { ratePercentToBps } from "@/lib/security-deposit-core";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const user = await currentUser();
  if (!user) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user, id) }, include: { tenant: true, unit: true } });
    if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte právo editace.");
    const form = await request.formData();
    const agreedAmountCents = moneyToCents(form, "agreedAmount");
    const annualRateBps = ratePercentToBps(text(form, "annualRate") || "0");
    const effectiveFrom = dateValue(form, "effectiveFrom", true)!;
    const term = await prisma.$transaction(async (tx) => {
      const created = await tx.securityDepositTerm.create({ data: { leaseId, agreedAmountCents, annualRateBps, effectiveFrom, note: text(form, "note"), createdById: user.id } });
      await tx.lease.update({ where: { id: leaseId }, data: { depositCents: agreedAmountCents } });
      return created;
    });
    await audit(user.id, "SECURITY_DEPOSIT_TERMS_CHANGED", "SecurityDepositTerm", term.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, amount: agreedAmountCents, rate: annualRateBps, date: effectiveFrom.toISOString() }, id);
    return goWithMessage(request, `/smlouvy/${leaseId}#kauce`, "ok", "Podmínky kauce byly uloženy.");
  } catch (error) { return goWithMessage(request, `/smlouvy/${leaseId}#kauce`, "error", error instanceof Error ? error.message : "Podmínky kauce se nepodařilo uložit."); }
}
