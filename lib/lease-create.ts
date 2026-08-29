import { LeaseStatus, Prisma, RentTiming, TenantType } from "@prisma/client";
import { boolValue, dateValue, intValue, moneyToCents, stringArray, text } from "./forms";
import { normalizePayerAccount } from "./owner-bank-account";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "./variable-symbol";
import { firstFutureAnniversary, syncLeaseCharges } from "./charge-automation";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "./lease-lifecycle";
import { ratePercentToBps } from "./security-deposit-core";
import { createOpeningBalance, createOpeningDepositBalance, resolveLeaseFinancialOnboarding } from "./lease-financial-onboarding";

type Tx = Prisma.TransactionClient;

function percentToBps(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) throw new Error("Indexace musí být mezi 0,01 a 100 %.");
  return Math.round(parsed * 100);
}

export async function createLeaseFromForm(tx: Tx, propertyId: string, form: FormData, tenantId?: string, createdById?: string) {
  const unitId = text(form, "unitId", true)!;
  const unit = await tx.unit.findFirst({ where: { id: unitId, propertyId }, include: { ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } });
  if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
  const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
  if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

  const startDate = dateValue(form, "startDate", true)!;
  const termType = text(form, "termType") || "INDEFINITE";
  const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
  if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
  const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
  const rentCents = moneyToCents(form, "rent");
  const servicesCents = moneyToCents(form, "services");
  const depositCents = moneyToCents(form, "deposit");
  const depositInterestBps = ratePercentToBps(text(form, "depositInterest") || "0");
  const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
  const timingRaw = text(form, "rentTiming") || "ADVANCE";
  const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;
  const autoChargesEnabled = boolValue(form, "autoChargesEnabled");
  const indexationEnabled = boolValue(form, "indexationEnabled");
  const indexationPercentBps = indexationEnabled ? percentToBps(text(form, "indexationPercent")) : null;
  const derivedStatus = leaseStatusAt({ startDate, endDate }) as LeaseStatus;
  const onboarding = resolveLeaseFinancialOnboarding(startDate, form, new Date(), depositCents);

  await assertNoLeaseOverlap(tx, { unitId, startDate, endDate });
  await assertUniqueVariableSymbol(tx, ownerBankAccountId, variableSymbol);
  await tx.propertyPaymentAccount.upsert({ where: { propertyId_ownerBankAccountId: { propertyId, ownerBankAccountId } }, update: { active: true }, create: { propertyId, ownerBankAccountId, active: true } });

  let tenant;
  if (tenantId) {
    tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Vybraný nájemník nebyl nalezen.");
    if (tenantBankAccount && !tenant.payerAccounts.includes(tenantBankAccount)) {
      tenant = await tx.tenant.update({ where: { id: tenant.id }, data: { payerAccounts: [...tenant.payerAccounts, tenantBankAccount] } });
    }
  } else {
    const tenantTypeRaw = text(form, "tenantType") || "PERSON";
    const tenantType = Object.values(TenantType).includes(tenantTypeRaw as TenantType) ? tenantTypeRaw as TenantType : TenantType.PERSON;
    const permanentAddress = tenantType === TenantType.PERSON ? text(form, "permanentAddress") : null;
    const billingAddress = tenantType === TenantType.COMPANY ? text(form, "billingAddress") : null;
    const billingEmail = tenantType === TenantType.COMPANY ? text(form, "billingEmail") : null;
    const communicationEmail = tenantType === TenantType.COMPANY ? text(form, "communicationEmail") : text(form, "email");
    tenant = await tx.tenant.create({ data: { type: tenantType, name: text(form, "name", true)!, email: communicationEmail || billingEmail, phone: text(form, "phone"), address: permanentAddress || billingAddress, ico: tenantType === TenantType.COMPANY ? text(form, "ico") : null, permanentAddress, correspondenceAddress: text(form, "correspondenceAddress"), billingAddress, billingEmail, communicationEmail, note: text(form, "tenantNote") || text(form, "note"), payerAccounts: Array.from(new Set([...stringArray(form, "payerAccounts").map(normalizePayerAccount), ...(tenantBankAccount ? [tenantBankAccount] : [])].filter(Boolean))), active: true } });
  }

  const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);
  const lease = await tx.lease.create({ data: { unitId, tenantId: tenant.id, ownerBankAccountId, tenantBankAccount, contractNumber: text(form, "contractNumber"), startDate, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, endDate, dueDay, variableSymbol, rentTiming, rentCents, servicesCents, depositCents, note: text(form, "leaseNote") || text(form, "note"), status: derivedStatus, autoChargesEnabled, indexationEnabled, indexationPercentBps, nextIndexationAt: indexationEnabled ? firstFutureAnniversary(startDate) : null, paymentItems: { create: [...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []), ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : [])] } } });
  const opening = await createOpeningBalance(tx, { leaseId: lease.id, dueDay, rentTiming, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, type: onboarding.openingBalanceType, amountCents: onboarding.openingBalanceCents, note: onboarding.openingBalanceNote, createdById });
  if (depositCents > 0 || depositInterestBps > 0) await tx.securityDepositTerm.create({ data: { leaseId: lease.id, agreedAmountCents: depositCents, annualRateBps: depositInterestBps, effectiveFrom: startDate } });
  const openingDeposit = await createOpeningDepositBalance(tx, { leaseId: lease.id, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, heldCents: onboarding.openingDepositHeldCents, createdById });
  await syncUnitOccupancyCache(tx, unitId);
  if (autoChargesEnabled) await syncLeaseCharges(tx, lease.id, { force: true, fromPeriod: onboarding.financialTrackingFromPeriod });
  return { tenant, lease, unitId, ownerBankAccountId, derivedStatus, autoChargesEnabled, indexationEnabled, termType, tenantBankAccount, ...onboarding, ...opening, ...openingDeposit };
}
