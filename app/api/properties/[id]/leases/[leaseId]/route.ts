import { LeaseStatus, RentTiming } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";
import { firstFutureAnniversary, periodKeyForDate, replaceRecurringAmount, syncLeaseCharges } from "@/lib/charge-automation";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "@/lib/lease-lifecycle";

function percentToBps(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) throw new Error("Indexace musí být mezi 0,01 a 100 %.");
  return Math.round(parsed * 100);
}

function currentMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } }, include: { securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] } } });
    if (!existing) throw new Error("Smlouva nebyla nalezena.");

    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;

    const [unit, tenant] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.tenant.findFirst({ where: { id: tenantId, OR: [{ leases: { some: { unit: { propertyId: id } } } }, { id: existing.tenantId }] } }),
    ]);
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (!tenant) throw new Error("Vybraný nájemník nepatří k této nemovitosti.");
    const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
    if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    if (existing.terminatedOn && existing.terminatedOn < startDate) throw new Error("Začátek smlouvy nemůže být po evidovaném skutečném ukončení. Nejprve opravte lifecycle událost.");

    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const depositCents = moneyToCents(form, "deposit");
    const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);
    const autoChargesEnabled = boolValue(form, "autoChargesEnabled");
    const indexationEnabled = boolValue(form, "indexationEnabled");
    const indexationPercentBps = indexationEnabled ? percentToBps(text(form, "indexationPercent")) : null;
    const indexationChanged = indexationEnabled !== existing.indexationEnabled || indexationPercentBps !== existing.indexationPercentBps || startDate.getTime() !== existing.startDate.getTime();
    const nextIndexationAt = indexationEnabled ? (indexationChanged || !existing.nextIndexationAt ? firstFutureAnniversary(startDate) : existing.nextIndexationAt) : null;
    const effectiveFrom = startDate > currentMonthStart() ? startDate : currentMonthStart();
    const derivedStatus = leaseStatusAt({ startDate, endDate, terminatedOn: existing.terminatedOn, cancelledAt: existing.cancelledAt }) as LeaseStatus;

    const lease = await prisma.$transaction(async (tx) => {
      await assertNoLeaseOverlap(tx, { unitId, startDate, endDate, terminatedOn: existing.terminatedOn, cancelledAt: existing.cancelledAt, excludeLeaseId: leaseId });
      await assertUniqueVariableSymbol(tx, ownerBankAccountId, variableSymbol, leaseId);
      await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId } },
        update: { active: true },
        create: { propertyId: id, ownerBankAccountId, active: true },
      });
      if (tenantBankAccount && !tenant.payerAccounts.includes(tenantBankAccount)) {
        await tx.tenant.update({ where: { id: tenant.id }, data: { payerAccounts: [...tenant.payerAccounts, tenantBankAccount] } });
      }

      if (rentCents !== existing.rentCents) await replaceRecurringAmount(tx, leaseId, "RENT", rentCents, effectiveFrom);
      if (servicesCents !== existing.servicesCents) await replaceRecurringAmount(tx, leaseId, "SERVICES", servicesCents, effectiveFrom);
      if (depositCents !== existing.depositCents) await tx.securityDepositTerm.create({ data: { leaseId, agreedAmountCents: depositCents, annualRateBps: existing.securityDepositTerms.at(-1)?.annualRateBps || 0, effectiveFrom, createdById: access.user.id, note: "Aktualizováno z editace smlouvy." } });

      const updated = await tx.lease.update({
        where: { id: leaseId },
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
          depositCents,
          note: text(form, "note"),
          remindersPausedUntil: dateValue(form, "remindersPausedUntil"),
          reminderPauseReason: text(form, "reminderPauseReason"),
          promisedPaymentDate: dateValue(form, "promisedPaymentDate"),
          promisedAmountCents: text(form, "promisedAmount") ? moneyToCents(form, "promisedAmount") : null,
          collectionNote: text(form, "collectionNote"),
          status: derivedStatus,
          autoChargesEnabled,
          indexationEnabled,
          indexationPercentBps,
          nextIndexationAt,
        },
      });

      await syncUnitOccupancyCache(tx, unitId);
      if (existing.unitId !== unitId) await syncUnitOccupancyCache(tx, existing.unitId);
      if (autoChargesEnabled) await syncLeaseCharges(tx, leaseId, { fromPeriod: periodKeyForDate(effectiveFrom), force: true });
      return updated;
    });

    await audit(access.user.id, "LEASE_UPDATED", "Lease", lease.id, { propertyId: id, lifecycleStatus: derivedStatus, termType, ownerBankAccountId, tenantBankAccount: Boolean(tenantBankAccount), autoChargesEnabled, indexationEnabled, amountsChanged: rentCents !== existing.rentCents || servicesCents !== existing.servicesCents }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", autoChargesEnabled ? "Smlouva byla upravena a budoucí předpisy synchronizovány." : "Smlouva byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo upravit.");
  }
}
