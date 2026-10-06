import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, tenantAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormPage, Textarea } from "@/components/FormUi";
import { RecoverableMutationForm } from "@/components/RecoverableMutationForm";
import { LeaseOccupantFields } from "@/components/LeaseOccupantFields";
import { LeaseServiceFields } from "@/components/LeaseServiceFields";
import { LeaseCoreFields } from "@/components/LeaseCoreFields";
import { dateInput } from "@/lib/forms";
import { proposedLeaseIdentity } from "@/lib/variable-symbol";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { currentPeriod } from "@/lib/period";
import { MethodologyCallout } from "@/components/MethodologyCallout";

export const dynamic = "force-dynamic";

export default async function NewLease({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; unitId?: string; tenantId?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [property, query, usedRows] = await Promise.all([
    requirePropertyAccess(user, id),
    searchParams,
    prisma.lease.findMany({ select: { variableSymbol: true } }),
  ]);
  if (!property) notFound();
  const tenants = await prisma.tenant.findMany({ where: { AND: [tenantAccessWhere(user), { OR: [{ createdById: user.id }, { propertyLinks: { some: { propertyId: id } } }, { leases: { some: { unit: { propertyId: id } } } }, { leaseParties: { some: { lease: { unit: { propertyId: id } } } } }] }] }, orderBy: { name: "asc" } });
  const availableUnits = property.units;
  const used = new Set(usedRows.map((row) => row.variableSymbol));
  const identities = Object.fromEntries(availableUnits.map((unit) => [unit.id, proposedLeaseIdentity(property, unit, used)]));
  const proposals = Object.fromEntries(availableUnits.map((unit) => [unit.id, identities[unit.id]?.variableSymbol ?? null]));
  const contractNumberProposals = Object.fromEntries(availableUnits.map((unit) => [unit.id, identities[unit.id]?.contractNumber ?? null]));
  const ownersByUnit = Object.fromEntries(availableUnits.map(unit => [unit.id, unit.ownerships[0]?.owner ? { id: unit.ownerships[0].owner.id, name: unit.ownerships[0].owner.name } : null]));
  const landlordChoicesByUnit = Object.fromEntries(availableUnits.map(unit => [unit.id, unit.ownerships.filter(ownership => ownership.owner.active).map(ownership => ({ id: ownership.owner.id, name: ownership.owner.name, account: ownership.ownerBankAccount?.active && ownership.ownerBankAccount.ownerId === ownership.owner.id ? { id: ownership.ownerBankAccount.id, label: ownerBankAccountLabel(ownership.ownerBankAccount) } : null }))]));
  const ownerAccountsByUnit = Object.fromEntries(availableUnits.map((unit) => { const account = unit.ownerships[0]?.ownerBankAccount; return [unit.id, account?.active ? { id: account.id, label: ownerBankAccountLabel(account) } : null]; }));
  const tenantAccountsByTenant = Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.payerAccounts]));

  return <Shell user={user} taskPropertyId={id}><FormPage title="Přidat nájemní smlouvu" description="Zvolte jednotku a dobu trvání. FlatBerry při uložení automaticky určí stav smlouvy a zablokuje jakýkoli překryv s existujícím nájemním obdobím." backHref={`/nemovitosti/${id}/smlouvy`}>
    <Flash ok={query.ok} error={query.error}/>
    <MethodologyCallout slug="najemni-smlouva"/>
    {availableUnits.length && tenants.length ? <RecoverableMutationForm action={`/api/properties/${id}/leases`} cancelHref={`/nemovitosti/${id}/smlouvy`} submitLabel="Vytvořit smlouvu" draftKey={`new-lease:${id}`}>
      <LeaseCoreFields tenantCreators={Object.fromEntries(tenants.map(tenant => [tenant.id, tenant.createdById]))} currentUserId={user.id} propertyId={id} unitOptions={availableUnits.map((unit) => [unit.id, unit.label])} tenantOptions={tenants.map((tenant) => [tenant.id, `${tenant.name} · ${tenant.communicationEmail || tenant.email || tenant.phone || (tenant.type === "COMPANY" ? "firma" : "osoba")}`])} defaultUnitId={query.unitId} defaultTenantId={query.tenantId} defaultStartDate={dateInput(new Date())} proposals={proposals} contractNumberProposals={contractNumberProposals} ownersByUnit={ownersByUnit} ownerAccountsByUnit={ownerAccountsByUnit} landlordChoicesByUnit={landlordChoicesByUnit} tenantAccountsByTenant={tenantAccountsByTenant} showGenerateCharges showFinancialOnboarding currentBusinessPeriod={currentPeriod()}/>
      <Field label="Nájemné Kč / měsíc" name="rent" type="number" step="0.01" min={0} required/>
      <LeaseServiceFields/>
      <LeaseOccupantFields people={tenants.filter(tenant => tenant.type === "PERSON").map(tenant => ({ id: tenant.id, name: tenant.name, email: tenant.email, phone: tenant.phone }))}/>
      <Textarea label="Poznámka" name="note"/>
    </RecoverableMutationForm> : <div className="card empty-state"><h2>Chybí jednotka nebo nájemník</h2><p>Budoucí smlouvu lze naplánovat i na dnes obsazenou jednotku, pokud její období nezačne dříve než po skončení současného nájmu.</p><Link className="primary" href={`/nemovitosti/${id}/najemnici/novy`}>Založit nájemníka</Link></div>}
  </FormPage></Shell>;
}
