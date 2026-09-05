import { PropertyPermission } from "@prisma/client";
import { businessDateKey } from "./calendar";
import { periodKeyForDate, replaceRecurringAmount, syncLeaseCharges } from "./charge-automation";
import { prisma } from "./db";
import { hasPropertyPermission } from "./management";
import { serializableTransaction } from "./serializable";
import { rentRollAmountsAt } from "./reporting/rent-roll";

type Actor = { id: string; role: string; allProperties?: boolean };

function nextMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12));
}

export function validateLeaseFinancialChange(input: { rentCents: number; servicesCents: number; effectiveFrom: Date; reason: string }, now = new Date()) {
  if (!Number.isInteger(input.rentCents) || input.rentCents < 0) throw new Error("Nájemné musí být platná nezáporná částka.");
  if (!Number.isInteger(input.servicesCents) || input.servicesCents < 0) throw new Error("Služby musí být platná nezáporná částka.");
  if (Number.isNaN(input.effectiveFrom.getTime()) || input.effectiveFrom.getUTCDate() !== 1) throw new Error("Účinnost změny musí být první den měsíce.");
  if (input.effectiveFrom < nextMonthStart(now)) throw new Error("Běžnou změnu lze naplánovat nejdříve od začátku příštího měsíce. Aktuální nebo minulý předpis opravte v jeho detailu.");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("Důvod změny musí mít 3 až 500 znaků.");
  return { ...input, reason };
}

export async function previewLeaseFinancialChange(actor: Actor, propertyId: string, leaseId: string, raw: { rentCents: number; servicesCents: number; effectiveFrom: Date; reason: string }) {
  const input = validateLeaseFinancialChange(raw);
  if (!await hasPropertyPermission(actor, propertyId, PropertyPermission.EDIT)) throw new Error("Ke změně financí smlouvy potřebujete právo upravovat nemovitost.");
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unit: { propertyId } },
    include: {
      tenant: true,
      unit: { include: { property: true } },
      paymentItems: true,
      charges: { include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { period: "asc" } },
      rentChangeProposals: { where: { status: "CONFIRMED", effectiveFrom: { gte: input.effectiveFrom } }, take: 1 },
    },
  });
  if (!lease) throw new Error("Smlouva nebyla nalezena.");
  if (lease.rentChangeProposals.length) throw new Error("Smlouva už má potvrzenou budoucí změnu z valorizačního plánu. Nejprve zkontrolujte tento plán.");
  if (lease.endDate && input.effectiveFrom > lease.endDate) throw new Error("Účinnost změny je až po konci smlouvy.");
  if (lease.terminatedOn && input.effectiveFrom > lease.terminatedOn) throw new Error("Účinnost změny je až po skutečném ukončení smlouvy.");
  if (lease.cancelledAt) throw new Error("Zrušenou budoucí smlouvu nelze finančně měnit.");
  if (lease.nextIndexationAt && lease.nextIndexationAt <= input.effectiveFrom) throw new Error("Před účinností změny proběhne automatická indexace. Nejdříve zkontrolujte valorizační plán.");
  const current = rentRollAmountsAt(lease, new Date());
  if (current.rent.amountCents === input.rentCents && current.services.amountCents === input.servicesCents) throw new Error("Nové částky jsou stejné jako dnešní nastavení.");
  const fromPeriod = periodKeyForDate(input.effectiveFrom);
  const affectedCharges = lease.charges.filter((charge) => charge.period >= fromPeriod && charge.active);
  const protectedCharge = affectedCharges.find((charge) => charge.manualOverride || charge.allocations.length > 0 || charge.securityDepositOffsets.length > 0 || charge.creditApplications.length > 0);
  if (protectedCharge) throw new Error(`Předpis ${protectedCharge.period} je ručně upravený nebo už obsahuje úhradu. Nejdříve jej zkontrolujte.`);
  return { lease, input, current, fromPeriod, affectedCharges };
}

export async function applyLeaseFinancialChange(actor: Actor, propertyId: string, leaseId: string, raw: { rentCents: number; servicesCents: number; effectiveFrom: Date; reason: string }) {
  const preview = await previewLeaseFinancialChange(actor, propertyId, leaseId, raw);
  return serializableTransaction(async (tx) => {
    const fresh = await tx.lease.findFirst({
      where: { id: leaseId, unit: { propertyId } },
      include: { paymentItems: true, charges: { include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true } } },
    });
    if (!fresh) throw new Error("Smlouva mezitím nebyla nalezena.");
    const current = rentRollAmountsAt(fresh, new Date());
    if (current.rent.amountCents !== preview.current.rent.amountCents || current.services.amountCents !== preview.current.services.amountCents) throw new Error("Finanční nastavení se mezitím změnilo. Obnovte náhled.");
    const protectedCharge = fresh.charges.find((charge) => charge.period >= preview.fromPeriod && charge.active && (charge.manualOverride || charge.allocations.length > 0 || charge.securityDepositOffsets.length > 0 || charge.creditApplications.length > 0));
    if (protectedCharge) throw new Error(`Předpis ${protectedCharge.period} se mezitím změnil. Obnovte náhled.`);
    if (preview.input.rentCents !== preview.current.rent.amountCents) await replaceRecurringAmount(tx, leaseId, "RENT", preview.input.rentCents, preview.input.effectiveFrom);
    if (preview.input.servicesCents !== preview.current.services.amountCents) await replaceRecurringAmount(tx, leaseId, "SERVICES", preview.input.servicesCents, preview.input.effectiveFrom);
    await tx.lease.update({ where: { id: leaseId }, data: { rentCents: preview.input.rentCents, servicesCents: preview.input.servicesCents } });
    const chargeSync = fresh.autoChargesEnabled ? await syncLeaseCharges(tx, leaseId, { fromPeriod: preview.fromPeriod, force: true }) : null;
    await tx.auditLog.create({ data: { userId: actor.id, propertyId, action: "LEASE_FINANCIAL_CHANGE_CONFIRMED", entityType: "Lease", entityId: leaseId, details: { previousRentCents: preview.current.rent.amountCents, newRentCents: preview.input.rentCents, previousServicesCents: preview.current.services.amountCents, newServicesCents: preview.input.servicesCents, effectiveFrom: businessDateKey(preview.input.effectiveFrom), reason: preview.input.reason, chargeSync } } });
    return { chargeSync };
  });
}
