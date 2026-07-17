import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { LeaseCoreFields } from "@/components/LeaseCoreFields";
import { dateInput, moneyInput } from "@/lib/forms";
import { proposedVariableSymbol } from "@/lib/variable-symbol";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";

export const dynamic = "force-dynamic";

export default async function EditLease({ params, searchParams }: { params: Promise<{ id: string; leaseId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, leaseId } = await params;
  const [property, lease, tenants, query, usedRows] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.lease.findFirst({ where: { id: leaseId, unit: unitAccessWhere(user, id) }, include: { tenant: true, unit: true, ownerBankAccount: true } }),
    prisma.tenant.findMany({ where: { OR: [{ leases: { some: { id: leaseId } } }, { active: true, leases: { some: { unit: { propertyId: id } } } }] }, orderBy: { name: "asc" } }),
    searchParams,
    prisma.lease.findMany({ where: { id: { not: leaseId } }, select: { variableSymbol: true } }),
  ]);
  if (!property || !lease) notFound();
  const used = new Set(usedRows.map((row) => row.variableSymbol));
  const proposals = Object.fromEntries(property.units.map((unit) => [unit.id, proposedVariableSymbol(property, unit, used)]));
  const ownerAccountsByUnit = Object.fromEntries(property.units.map((unit) => { const account = unit.ownerships[0]?.ownerBankAccount; return [unit.id, account ? { id: account.id, label: ownerBankAccountLabel(account) } : null]; }));
  const tenantAccountsByTenant = Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.payerAccounts]));

  return <Shell user={user}><FormPage title={`Upravit smlouvu: ${lease.unit.label}`} description={lease.tenant.name} backHref={`/nemovitosti/${id}/jednotky/${lease.unitId}`}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/leases/${lease.id}`} cancelHref={`/nemovitosti/${id}/jednotky/${lease.unitId}`}>
      <LeaseCoreFields unitOptions={property.units.map((unit) => [unit.id, unit.label])} tenantOptions={tenants.map((tenant) => [tenant.id, tenant.name])} defaultUnitId={lease.unitId} defaultTenantId={lease.tenantId} defaultContractNumber={lease.contractNumber} defaultStartDate={dateInput(lease.startDate)} defaultEndDate={dateInput(lease.endDate)} defaultStatus={lease.status} defaultDueDay={lease.dueDay} defaultRentTiming={lease.rentTiming} defaultVariableSymbol={lease.variableSymbol} defaultTenantBankAccount={lease.tenantBankAccount} proposals={proposals} ownerAccountsByUnit={ownerAccountsByUnit} tenantAccountsByTenant={tenantAccountsByTenant}/>
      <Field label="Nájemné Kč / měsíc" name="rent" type="number" step="0.01" min={0} defaultValue={moneyInput(lease.rentCents).replace(",", ".")}/>
      <Field label="Služby Kč / měsíc" name="services" type="number" step="0.01" min={0} defaultValue={moneyInput(lease.servicesCents).replace(",", ".")}/>
      <Field label="Kauce Kč" name="deposit" type="number" step="0.01" min={0} defaultValue={moneyInput(lease.depositCents).replace(",", ".")}/>
      <Textarea label="Poznámka" name="note" defaultValue={lease.note}/>
      <div className="field field-full"><h3>Upomínky a inkaso</h3><p className="muted-copy">Dočasné pozastavení má přednost před globálním automatickým plánem.</p></div>
      <Field label="Pozastavit automatické upomínky do" name="remindersPausedUntil" type="date" defaultValue={dateInput(lease.remindersPausedUntil)}/>
      <Field label="Slíbené datum úhrady" name="promisedPaymentDate" type="date" defaultValue={dateInput(lease.promisedPaymentDate)}/>
      <Field label="Slíbená částka Kč" name="promisedAmount" type="number" step="0.01" min={0} defaultValue={lease.promisedAmountCents == null ? "" : moneyInput(lease.promisedAmountCents).replace(",", ".")}/>
      <Textarea label="Důvod pozastavení" name="reminderPauseReason" defaultValue={lease.reminderPauseReason}/>
      <Textarea label="Interní poznámka k inkasu" name="collectionNote" defaultValue={lease.collectionNote}/>
    </FormCard>
  </FormPage></Shell>;
}
