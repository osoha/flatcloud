import { LeaseStatus, RentTiming, TenantType, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, stringArray, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { leases: { where: { status: "ACTIVE" } } } });
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (unit.leases.length) throw new Error("Vybraná jednotka už má aktivní smlouvu.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const statusRaw = text(form, "status") || "ACTIVE";
    const status = Object.values(LeaseStatus).includes(statusRaw as LeaseStatus) ? statusRaw as LeaseStatus : LeaseStatus.ACTIVE;
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

    const result = await prisma.$transaction(async (tx) => {
      await assertUniqueVariableSymbol(tx, variableSymbol);
      const tenant = await tx.tenant.create({ data: { type: tenantType, name: text(form, "name", true)!, email: communicationEmail || billingEmail, phone: text(form, "phone"), address: permanentAddress || billingAddress, ico: tenantType === "COMPANY" ? text(form, "ico") : null, permanentAddress, correspondenceAddress: text(form, "correspondenceAddress"), billingAddress, billingEmail, communicationEmail, note: text(form, "tenantNote"), payerAccounts: stringArray(form, "payerAccounts").map((value) => value.replace(/\s+/g, "").toUpperCase()) } });
      const lease = await tx.lease.create({ data: { unitId, tenantId: tenant.id, contractNumber: text(form, "contractNumber"), startDate, endDate, dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31), variableSymbol, rentTiming, rentCents, servicesCents, depositCents: moneyToCents(form, "deposit"), note: text(form, "leaseNote"), status, paymentItems: { create: [...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []), ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : [])] } } });
      await tx.unit.update({ where: { id: unitId }, data: { status: status === "ACTIVE" ? UnitStatus.OCCUPIED : unit.status } });
      return { tenant, lease };
    });
    await audit(access.user.id, "TENANT_AND_LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, tenantId: result.tenant.id, unitId, termType });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", "Nájemník a smlouva byli vytvořeni.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/novy`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo vytvořit.");
  }
}
