import { createLeaseOccupants } from "./lease-create-occupants";
import { leaseServiceItemsFromForm } from "./lease-service-items";
import { LeaseStatus, Prisma, RentTiming } from "@prisma/client";
import { boolValue, dateValue, intValue, moneyToCents, text } from "./forms";
import { normalizePayerAccount } from "./owner-bank-account";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "./variable-symbol";
import { firstFutureAnniversary, syncLeaseCharges } from "./charge-automation";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "./lease-lifecycle";
import { ratePercentToBps } from "./security-deposit-core";
import { createOpeningBalance, createOpeningDepositBalance, resolveLeaseFinancialOnboarding } from "./lease-financial-onboarding";
import { LeasePartySelections, syncLeaseParties } from "./lease-parties";
import { tenantDataFromForm } from "./tenant-form";

type Tx = Prisma.TransactionClient;

function percentToBps(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) throw new Error("Indexace musí být mezi 0,01 a 100 %.");
  return Math.round(parsed * 100);
}

export async function createLeaseFromForm(tx: Tx, propertyId: string, form: FormData, tenantId?: string, createdById?: string, partySelections: LeasePartySelections = {}) {
  const unitId = text(form, "unitId", true)!;
  const unit = await tx.unit.findFirst({ where: { id: unitId, propertyId }, include: { property: {select:{tenantPortalInvitationMode:true}}, ownerships: { include: { owner: true, ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } });
  if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
  const selectedOwnerId = text(form, "landlordOwnerId");
  const eligibleOwnerships = unit.ownerships.filter(row => row.owner.active);
  const ownership = eligibleOwnerships.length === 1 ? eligibleOwnerships[0] : eligibleOwnerships.find(row => row.ownerId === selectedOwnerId);
  if (!ownership || eligibleOwnerships.length > 1 && !selectedOwnerId) throw new Error("Vyberte smluvního pronajímatele z vlastníků jednotky.");
  if (selectedOwnerId && ownership.ownerId !== selectedOwnerId || !ownership.owner.active) throw new Error("Smluvní pronajímatel neodpovídá aktivnímu vlastníkovi jednotky.");
  const ownerBankAccountId = ownership.ownerBankAccountId;
  if (!ownerBankAccountId || !ownership.ownerBankAccount?.active || ownership.ownerBankAccount.ownerId !== ownership.ownerId) throw new Error("U vybraného pronajímatele nejprve nastavte jeho aktivní účet pro úhrady jednotky.");
  if (!createdById) throw new Error("Vystavitele nové smlouvy musí potvrdit přihlášený uživatel.");

  const startDate = dateValue(form, "startDate", true)!;
  const termType = text(form, "termType") || "INDEFINITE";
  const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
  if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
  const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
  const rentCents = moneyToCents(form, "rent");
  const serviceItems = leaseServiceItemsFromForm(form);
  const servicesCents = serviceItems.reduce((sum, item) => sum + item.amountCents, 0);
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
    const tenantData = tenantDataFromForm(form);
    tenantData.payerAccounts = Array.from(new Set([...(tenantData.payerAccounts as string[]), ...(tenantBankAccount ? [tenantBankAccount] : [])]));
    tenant = await tx.tenant.create({ data: { ...tenantData, ...(createdById ? { createdBy: { connect: { id: createdById } } } : {}) } });
  }

  await tx.tenantProperty.upsert({ where: { tenantId_propertyId: { tenantId: tenant.id, propertyId } }, update: {}, create: { tenantId: tenant.id, propertyId } });

  const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);
  const documentOrigin = text(form, "documentOrigin") === "EXISTING" ? "EXISTING" : "NEW";
  const lease = await tx.lease.create({ data: { unitId, tenantId: tenant.id, autoPortalInvitationPending:unit.property.tenantPortalInvitationMode==="AUTOMATIC", ownerBankAccountId, tenantBankAccount, documentOrigin, contractNumber: text(form, "contractNumber"), startDate, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, endDate, dueDay, variableSymbol, rentTiming, rentCents, servicesCents, depositCents, note: text(form, "leaseNote") || text(form, "note"), status: derivedStatus, autoChargesEnabled, indexationEnabled, indexationPercentBps, nextIndexationAt: indexationEnabled ? firstFutureAnniversary(startDate) : null, paymentItems: { create: [...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []), ...serviceItems.map((item, index) => ({ ...item, validFrom: startDate, sortOrder: 20 + index }))] } } });
  if (documentOrigin === "NEW") {
    const landlordPeriod = await tx.leaseLandlordPeriod.create({ data: { leaseId: lease.id, ownerId: ownership.ownerId, fromPeriod: text(form, "startDate", true)!.slice(0, 7), confirmedById: createdById } });
    await tx.auditLog.create({ data: { userId: createdById, propertyId, action: "LEASE_LANDLORD_AUTO_ASSIGNED", entityType: "LeaseLandlordPeriod", entityId: landlordPeriod.id, details: { leaseId: lease.id, ownerId: ownership.ownerId, unitOwnershipId: ownership.id, ownerBankAccountId, fromPeriod: landlordPeriod.fromPeriod, source: "NEW_LEASE_UNIT_OWNER" } } });
  }
  await createLeaseOccupants(tx, lease.id, tenant.id, form, createdById);
  const parties = await syncLeaseParties(tx, lease.id, tenant.id, partySelections);
  for (const linkedTenantId of Array.from(new Set(Object.values(parties).flat()))) {
    await tx.tenantProperty.upsert({ where: { tenantId_propertyId: { tenantId: linkedTenantId, propertyId } }, update: {}, create: { tenantId: linkedTenantId, propertyId } });
  }
  const contractingPartyIds = [tenant.id, ...parties.contractingPartyIds];
  const opening = await createOpeningBalance(tx, { leaseId: lease.id, dueDay, rentTiming, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, type: onboarding.openingBalanceType, amountCents: onboarding.openingBalanceCents, note: onboarding.openingBalanceNote, createdById });
  if (depositCents > 0 || depositInterestBps > 0) await tx.securityDepositTerm.create({ data: { leaseId: lease.id, agreedAmountCents: depositCents, annualRateBps: depositInterestBps, effectiveFrom: startDate } });
  const openingDeposit = await createOpeningDepositBalance(tx, { leaseId: lease.id, financialTrackingFromPeriod: onboarding.financialTrackingFromPeriod, heldCents: onboarding.openingDepositHeldCents, createdById });
  await syncUnitOccupancyCache(tx, unitId);
  if (autoChargesEnabled) await syncLeaseCharges(tx, lease.id, { force: true, fromPeriod: onboarding.financialTrackingFromPeriod });
  return { tenant, lease, contractingPartyIds, parties, unitId, ownerId: ownership.ownerId, ownerBankAccountId, derivedStatus, autoChargesEnabled, indexationEnabled, termType, tenantBankAccount, ...onboarding, ...opening, ...openingDeposit };
}

