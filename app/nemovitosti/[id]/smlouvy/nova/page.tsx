import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { LeaseCoreFields } from "@/components/LeaseCoreFields";
import { dateInput } from "@/lib/forms";
import { proposedVariableSymbol } from "@/lib/variable-symbol";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";

export const dynamic = "force-dynamic";

export default async function NewLease({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; unitId?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [property, tenants, query, usedRows] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.tenant.findMany({ where: { leases: { some: { unit: { propertyId: id } } } }, orderBy: { name: "asc" } }),
    searchParams,
    prisma.lease.findMany({ select: { variableSymbol: true } }),
  ]);
  if (!property) notFound();
  const availableUnits = property.units;
  const used = new Set(usedRows.map((row) => row.variableSymbol));
  const proposals = Object.fromEntries(availableUnits.map((unit) => [unit.id, proposedVariableSymbol(property, unit, used)]));
  const ownerAccountsByUnit = Object.fromEntries(availableUnits.map((unit) => { const account = unit.ownerships[0]?.ownerBankAccount; return [unit.id, account ? { id: account.id, label: ownerBankAccountLabel(account) } : null]; }));
  const tenantAccountsByTenant = Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.payerAccounts]));

  return <Shell user={user} taskPropertyId={id}><FormPage title="Přidat nájemní smlouvu" description="Zvolte jednotku a dobu trvání. FlatCloud při uložení automaticky určí stav smlouvy a zablokuje jakýkoli překryv s existujícím nájemním obdobím." backHref={`/nemovitosti/${id}/smlouvy`}>
    <Flash ok={query.ok} error={query.error}/>
    {availableUnits.length && tenants.length ? <FormCard action={`/api/properties/${id}/leases`} cancelHref={`/nemovitosti/${id}/smlouvy`} submitLabel="Vytvořit smlouvu">
      <LeaseCoreFields unitOptions={availableUnits.map((unit) => [unit.id, unit.label])} tenantOptions={tenants.map((tenant) => [tenant.id, tenant.name])} defaultUnitId={query.unitId} defaultStartDate={dateInput(new Date())} proposals={proposals} ownerAccountsByUnit={ownerAccountsByUnit} tenantAccountsByTenant={tenantAccountsByTenant} showGenerateCharges/>
      <Field label="Nájemné Kč / měsíc" name="rent" type="number" step="0.01" min={0} required/>
      <Field label="Zálohy na služby Kč / měsíc" name="services" type="number" step="0.01" min={0}/>
      <Field label="Kauce Kč" name="deposit" type="number" step="0.01" min={0}/>
      <Textarea label="Poznámka" name="note"/>
    </FormCard> : <div className="card empty-state"><h2>Chybí jednotka nebo nájemník</h2><p>Budoucí smlouvu lze naplánovat i na dnes obsazenou jednotku, pokud její období nezačne dříve než po skončení současného nájmu.</p></div>}
  </FormPage></Shell>;
}
