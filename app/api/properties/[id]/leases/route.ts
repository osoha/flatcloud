import { LeaseStatus, RentTiming, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { periodDueDate, periodsBetween } from "@/lib/period";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const [unit, tenant] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { leases: { where: { status: "ACTIVE" } }, ownerships: { include: { ownerBankAccount: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.tenant.findFirst({ where: { id: tenantId, active: true, leases: { some: { unit: { propertyId: id } } } } }),
    ]);
    if (!unit || !tenant) throw new Error("Jednotka nebo nájemník nebyli nalezeni.");
    if (unit.leases.length) throw new Error("Jednotka už má aktivní smlouvu.");
    const ownerBankAccountId = unit.ownerships[0]?.ownerBankAccountId;
    if (!ownerBankAccountId || !unit.ownerships[0]?.ownerBankAccount?.active) throw new Error("U vlastnictví jednotky nejprve vyberte aktivní bankovní účet vlastníka.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    const generateCharges = boolValue(form, "generateCharges");
    if (generateCharges && !endDate) throw new Error("Předpisy na celé období lze vytvořit jen u smlouvy na dobu určitou.");

    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);
    const tenantBankAccount = normalizePayerAccount(text(form, "tenantBankAccount")) || null;
    const statusRaw = text(form, "status") || "ACTIVE";
    const status = Object.values(LeaseStatus).includes(statusRaw as LeaseStatus) ? statusRaw as LeaseStatus : LeaseStatus.ACTIVE;
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const dueDay = Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31);

    const lease = await prisma.$transaction(async (tx) => {
      await assertUniqueVariableSymbol(tx, variableSymbol);
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
          status,
          paymentItems: { create: [
            ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []),
            ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : []),
          ] },
        },
      });
      if (status === "ACTIVE") await tx.unit.update({ where: { id: unitId }, data: { status: UnitStatus.OCCUPIED } });
      if (generateCharges && endDate) {
        const items = [
          ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents }] : []),
          ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents }] : []),
        ];
        for (const period of periodsBetween(startDate, endDate)) {
          await tx.charge.create({ data: { leaseId: created.id, period, dueDate: periodDueDate(period, dueDay, rentTiming), amountCents: items.reduce((sum, item) => sum + item.amountCents, 0), items: { create: items } } });
        }
      }
      return created;
    });
    await audit(access.user.id, "LEASE_CREATED", "Lease", lease.id, { propertyId: id, generateCharges, rentTiming, termType, ownerBankAccountId, tenantBankAccount: Boolean(tenantBankAccount) });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${lease.id}`, "ok", generateCharges ? "Smlouva i předpisy byly vytvořeny." : "Smlouva byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
