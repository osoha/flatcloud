import { LeaseStatus, RentTiming } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";
import { firstFutureAnniversary, periodKeyForDate, syncLeaseCharges } from "@/lib/charge-automation";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "@/lib/lease-lifecycle";

function percentToBps(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) throw new Error("Indexace musí být mezi 0,01 a 100 %.");
  return Math.round(parsed * 100);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const [unit, tenant] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.tenant.findFirst({ where: { id: tenantId, leases: { some: { unit: { propertyId: id } } } } }),
    ]);
    if (!unit || !tenant) throw new Error("Jednotka nebo nájemník nebyli nalezeni.");
    const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
    if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");

    const autoChargesEnabled = boolValue(form, "autoChargesEnabled");
    const indexationEnabled = boolValue(form, "indexationEnabled");
    const indexationPercentBps = indexationEnabled ? percentToBps(text(form, "indexationPercent")) : null;
    const nextIndexationAt = indexationEnabled ? firstFutureAnniversary(startDate) : null;
    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);
    const derivedStatus = leaseStatusAt({ startDate, endDate }) as LeaseStatus;

    const lease = await prisma.$transaction(async (tx) => {
      await assertNoLeaseOverlap(tx, { unitId, startDate, endDate });
      await assertUniqueVariableSymbol(tx, ownerBankAccountId, variableSymbol);
      await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId } },
        update: { active: true },
        create: { propertyId: id, ownerBankAccountId, active: true },
      });
      if (tenantBankAccount && !tenant.payerAccounts.includes(tenantBankAccount)) {
        await tx.tenant.update({ where: { id: tenant.id }, data: { payerAccounts: [...tenant.payerAccounts, tenantBankAccount] } });
      }
      const created = await tx.lease.create({
        data: {
          unitId,
          tenantId,
          ownerBankAccountId,
          tenantBankAccount,
          contractNumber: text(form, "contractNumber"),
          startDate,
          endDate,
          dueDay,
          variableSymbol,
          rentTiming,
          rentCents,
          servicesCents,
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "note"),
          status: derivedStatus,
          autoChargesEnabled,
          indexationEnabled,
          indexationPercentBps,
          nextIndexationAt,
          paymentItems: { create: [
            ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []),
            ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : []),
          ] },
        },
      });
      await syncUnitOccupancyCache(tx, unitId);
      if (autoChargesEnabled) {
        const now = new Date();
        const fromPeriod = endDate ? periodKeyForDate(startDate) : periodKeyForDate(startDate > now ? startDate : now);
        await syncLeaseCharges(tx, created.id, { force: true, fromPeriod });
      }
      return created;
    });
    await audit(access.user.id, "LEASE_CREATED", "Lease", lease.id, { propertyId: id, lifecycleStatus: derivedStatus, autoChargesEnabled, indexationEnabled, rentTiming, termType, ownerBankAccountId, tenantBankAccount: Boolean(tenantBankAccount) }, id);
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${lease.id}`, "ok", autoChargesEnabled ? "Smlouva i automatické předpisy byly vytvořeny." : "Smlouva byla vytvořena bez automatických předpisů.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
