import { LeaseStatus, RentTiming, TenantType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, stringArray, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "@/lib/lease-lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, propertyId: id },
      include: { ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
    if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;
    const tenantTypeRaw = text(form, "tenantType") || "PERSON";
    const tenantType = Object.values(TenantType).includes(tenantTypeRaw as TenantType) ? tenantTypeRaw as TenantType : TenantType.PERSON;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const permanentAddress = tenantType === "PERSON" ? text(form, "permanentAddress") : null;
    const billingAddress = tenantType === "COMPANY" ? text(form, "billingAddress") : null;
    const billingEmail = tenantType === "COMPANY" ? text(form, "billingEmail") : null;
    const communicationEmail = tenantType === "COMPANY" ? text(form, "communicationEmail") : text(form, "email");
    const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
    const payerAccounts = Array.from(new Set([
      ...stringArray(form, "payerAccounts").map(normalizePayerAccount),
      ...(tenantBankAccount ? [tenantBankAccount] : []),
    ].filter(Boolean)));
    const derivedStatus = leaseStatusAt({ startDate, endDate }) as LeaseStatus;

    const result = await prisma.$transaction(async (tx) => {
      await assertNoLeaseOverlap(tx, { unitId, startDate, endDate });
      await assertUniqueVariableSymbol(tx, ownerBankAccountId, variableSymbol);
      await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId } },
        update: { active: true },
        create: { propertyId: id, ownerBankAccountId, active: true },
      });
      const tenant = await tx.tenant.create({
        data: {
          type: tenantType,
          name: text(form, "name", true)!,
          email: communicationEmail || billingEmail,
          phone: text(form, "phone"),
          address: permanentAddress || billingAddress,
          ico: tenantType === "COMPANY" ? text(form, "ico") : null,
          permanentAddress,
          correspondenceAddress: text(form, "correspondenceAddress"),
          billingAddress,
          billingEmail,
          communicationEmail,
          note: text(form, "tenantNote"),
          payerAccounts,
          active: true,
        },
      });
      const lease = await tx.lease.create({
        data: {
          unitId,
          tenantId: tenant.id,
          ownerBankAccountId,
          tenantBankAccount,
          contractNumber: text(form, "contractNumber"),
          startDate,
          endDate,
          dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31),
          variableSymbol,
          rentTiming,
          rentCents,
          servicesCents,
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "leaseNote"),
          status: derivedStatus,
          paymentItems: { create: [
            ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []),
            ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : []),
          ] },
        },
      });
      await syncUnitOccupancyCache(tx, unitId);
      return { tenant, lease };
    });
    await audit(access.user.id, "TENANT_AND_LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, tenantId: result.tenant.id, unitId, termType, lifecycleStatus: derivedStatus, ownerBankAccountId, tenantBankAccount: Boolean(tenantBankAccount) }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", "Nájemník a smlouva byli vytvořeni.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/novy`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo vytvořit.");
  }
}
