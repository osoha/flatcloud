import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { audit } from "@/lib/management";
import { moneyToCents, text } from "@/lib/forms";
import { remainingCreditCents } from "@/lib/credit";
import { outstandingCents } from "@/lib/charges";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { go, goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params; const user = await currentUser(); if (!user) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user, id) }, select: { id: true, tenantId: true, unitId: true } }); if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte právo editace.");
    const form = await request.formData(); const creditId = text(form, "creditId", true)!; const chargeId = text(form, "chargeId", true)!; const amountCents = moneyToCents(form, "amount");
    const result = await serializableTransaction(async (tx) => {
      const credit = await tx.leaseCredit.findFirst({ where: { id: creditId, leaseId }, include: { applications: true } }); const charge = await tx.charge.findFirst({ where: { id: chargeId, leaseId }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true } });
      if (!credit || !charge) throw new Error("Kredit nebo předpis nepatří ke stejné smlouvě."); const creditRemaining = remainingCreditCents(credit); const chargeOutstanding = outstandingCents(charge); if (amountCents <= 0 || amountCents > creditRemaining) throw new Error("Částka převyšuje zbývající kredit."); if (amountCents > chargeOutstanding) throw new Error("Částka převyšuje aktuální dluh předpisu.");
      const application = await tx.leaseCreditApplication.create({ data: { creditId, chargeId, amountCents, effectiveAt: new Date(), createdById: user.id } }); return { application, remainingCents: creditRemaining - amountCents };
    });
    await audit(user.id, "LEASE_CREDIT_APPLIED", "LeaseCreditApplication", result.application.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, creditId, chargeId, amountCents, remainingCents: result.remainingCents }, id); await resolveCollectionTasksIfSettled(leaseId);
    return goWithMessage(request, `/smlouvy/${leaseId}`, "ok", "Přeplatek byl započten.");
  } catch (error) { return goWithMessage(request, `/smlouvy/${leaseId}`, "error", error instanceof Error ? error.message : "Kredit se nepodařilo započíst."); }
}
