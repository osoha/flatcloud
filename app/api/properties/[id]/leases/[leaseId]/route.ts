import { LeaseStatus, RentTiming } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, moneyToCents, stringArray, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { tenantAccessWhere } from "@/lib/access";
import { allSelectedPartyIds, normalizeLeasePartySelections, syncLeaseParties } from "@/lib/lease-parties";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";
import { firstFutureAnniversary, periodKeyForDate, syncLeaseCharges } from "@/lib/charge-automation";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "@/lib/lease-lifecycle";
import { businessMonthKey } from "@/lib/calendar";

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
    const existing = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } }, include: { securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] }, paymentItems: true, charges: { include: { items: true } }, rentChangeProposals: { where: { status: "CONFIRMED", effectiveFrom: { gt: currentMonthStart() } }, orderBy: { effectiveFrom: "asc" }, take: 1 } } });
    if (!existing) throw new Error("Smlouva nebyla nalezena.");

    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const partySelections = normalizeLeasePartySelections(tenantId, {
      contractingPartyIds: stringArray(form, "contractingPartyIds"),
      payerPartyIds: stringArray(form, "payerPartyIds"),
      contactPartyIds: stringArray(form, "contactPartyIds"),
      guarantorPartyIds: stringArray(form, "guarantorPartyIds"),
    });
    const requestedTenantIds = allSelectedPartyIds(tenantId, partySelections);
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;

    const [unit, allowedTenants] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.tenant.findMany({ where: { AND: [{ id: { in: requestedTenantIds } }, tenantAccessWhere(access.user)] } }),
    ]);
    const tenant = allowedTenants.find((row) => row.id === tenantId);
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (!tenant) throw new Error("Vybraný nájemník není v rozsahu vašich oprávnění.");
    if (allowedTenants.length !== requestedTenantIds.length) throw new Error("Některá další smluvní strana není v rozsahu vašich oprávnění.");
    const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
    if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

    const startDate = dateValue(form, "startDate", true)!;
    if (businessMonthKey(startDate) > existing.financialTrackingFromPeriod) throw new Error("Začátek smlouvy nelze posunout za začátek existující finanční evidence.");
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    if (existing.terminatedOn && existing.terminatedOn < startDate) throw new Error("Začátek smlouvy nemůže být po evidovaném skutečném ukončení. Nejprve opravte lifecycle událost.");

    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
    const depositCents = moneyToCents(form, "deposit");
    const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);
    const autoChargesEnabled = boolValue(form, "autoChargesEnabled");
    const indexationEnabled = boolValue(form, "indexationEnabled");
    const indexationPercentBps = indexationEnabled ? percentToBps(text(form, "indexationPercent")) : null;
    const indexationChanged = indexationEnabled !== existing.indexationEnabled || indexationPercentBps !== existing.indexationPercentBps || startDate.getTime() !== existing.startDate.getTime();
    const nextIndexationAt = indexationEnabled ? (indexationChanged || !existing.nextIndexationAt ? firstFutureAnniversary(startDate) : existing.nextIndexationAt) : null;
    const futureRentChange = existing.rentChangeProposals[0] || null;
    if (futureRentChange && indexationChanged) throw new Error("Smlouva má potvrzenou budoucí změnu nájemného. Indexaci upravte až po nové revizi valorizačního plánu.");
    if (futureRentChange && endDate && endDate < futureRentChange.effectiveFrom) throw new Error("Konec smlouvy je před potvrzenou budoucí změnou nájemného. Nejprve opravte valorizační plán.");
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

      if (depositCents !== existing.depositCents) await tx.securityDepositTerm.create({ data: { leaseId, agreedAmountCents: depositCents, annualRateBps: existing.securityDepositTerms.at(-1)?.annualRateBps || 0, effectiveFrom: currentMonthStart(), createdById: access.user.id, note: "Aktualizováno z editace smlouvy." } });

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
      const partyRoles = await syncLeaseParties(tx, leaseId, tenantId, partySelections);
      for (const linkedTenantId of Array.from(new Set([tenantId, ...Object.values(partyRoles).flat()]))) {
        await tx.tenantProperty.upsert({ where: { tenantId_propertyId: { tenantId: linkedTenantId, propertyId: id } }, update: {}, create: { tenantId: linkedTenantId, propertyId: id } });
      }

      await syncUnitOccupancyCache(tx, unitId);
      if (existing.unitId !== unitId) await syncUnitOccupancyCache(tx, existing.unitId);
      if (autoChargesEnabled) await syncLeaseCharges(tx, leaseId, { fromPeriod: periodKeyForDate(currentMonthStart()), force: true });
      return updated;
    });

    await audit(access.user.id, "LEASE_UPDATED", "Lease", lease.id, { propertyId: id, lifecycleStatus: derivedStatus, termType, ownerBankAccountId, tenantBankAccount: Boolean(tenantBankAccount), partyTenantIds: requestedTenantIds, partyRoles: partySelections, autoChargesEnabled, indexationEnabled, confirmedFutureRentChangePreserved: Boolean(futureRentChange), financialAmountsEditableHere: false }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", futureRentChange ? "Smlouva byla upravena; potvrzená budoucí změna nájemného zůstala zachována." : autoChargesEnabled ? "Smlouva byla upravena a budoucí předpisy synchronizovány." : "Smlouva byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo upravit.");
  }
}
