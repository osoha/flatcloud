import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, tenantAccessWhere, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { LeaseCoreFields } from "@/components/LeaseCoreFields";
import { dateInput, moneyInput } from "@/lib/forms";
import { proposedLeaseIdentity } from "@/lib/variable-symbol";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";
import { date, money } from "@/lib/format";
import { hasPropertyPermission } from "@/lib/management";
import { PropertyPermission } from "@prisma/client";
import { rentRollAmountsAt } from "@/lib/reporting/rent-roll";

export const dynamic = "force-dynamic";

export default async function EditLease({ params, searchParams }: { params: Promise<{ id: string; leaseId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, leaseId } = await params;
  const [property, lease, tenants, query, usedRows] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.lease.findFirst({ where: { id: leaseId, unit: unitAccessWhere(user, id) }, include: { tenant: true, unit: true, ownerBankAccount: true, parties: { include: { tenant: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, paymentItems: true, charges: { include: { items: true } }, rentChangeProposals: { where: { status: "CONFIRMED", effectiveFrom: { gt: new Date() } }, orderBy: { effectiveFrom: "asc" }, take: 1 } } }),
    prisma.tenant.findMany({ where: tenantAccessWhere(user), orderBy: { name: "asc" } }),
    searchParams,
    prisma.lease.findMany({ where: { id: { not: leaseId } }, select: { variableSymbol: true } }),
  ]);
  if (!property || !lease) notFound();
  const used = new Set(usedRows.map((row) => row.variableSymbol));
  const identities = Object.fromEntries(property.units.map((unit) => [unit.id, proposedLeaseIdentity(property, unit, used)]));
  const proposals = Object.fromEntries(property.units.map((unit) => [unit.id, identities[unit.id]?.variableSymbol ?? null]));
  const ownerAccountsByUnit = Object.fromEntries(property.units.map((unit) => { const account = unit.ownerships[0]?.ownerBankAccount; return [unit.id, account ? { id: account.id, label: ownerBankAccountLabel(account) } : null]; }));
  const tenantAccountsByTenant = Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.payerAccounts]));
  const lifecycleStatus = leaseStatusAt(lease);
  const canReactivate = await hasPropertyPermission(user, id, PropertyPermission.ADMIN);
  const liveAmounts = rentRollAmountsAt(lease, new Date());
  const futureRentChange = lease.rentChangeProposals[0] || null;

  return <Shell user={user} taskPropertyId={id} taskLeaseId={lease.id}><FormPage title={`Upravit smlouvu: ${lease.unit.label}`} description={lease.tenant.name} backHref={`/nemovitosti/${id}/jednotky/${lease.unitId}`}>
    <Flash ok={query.ok} error={query.error}/>
    <div className="notice"><strong>Stav smlouvy: {leaseStatuses[lifecycleStatus]}</strong><span>Stav je odvozen automaticky z data platnosti a lifecycle událostí a nelze jej ručně přepnout.</span></div>
    <div className="notice"><strong>Finanční evidence od: {lease.financialTrackingFromPeriod}</strong><span>Hranice finanční evidence je po založení pouze pro čtení. Její změna vyžaduje samostatný korekční workflow, aby nebyla dotčena existující finanční historie.</span></div>
    {futureRentChange&&<div className="notice"><strong>Potvrzená budoucí změna: {money(futureRentChange.proposedRentCents)} od {date(futureRentChange.effectiveFrom)}</strong><span>Formulář zobrazuje dnešní účinné nájemné. Uložení ostatních údajů zachová schválenou budoucí verzi; změna indexace nebo zkrácení smlouvy před účinnost je blokováno.</span></div>}
    <FormCard action={`/api/properties/${id}/leases/${lease.id}`} cancelHref={`/nemovitosti/${id}/jednotky/${lease.unitId}`}>
      <LeaseCoreFields unitOptions={property.units.map((unit) => [unit.id, unit.label])} tenantOptions={tenants.map((tenant) => [tenant.id, tenant.name])} defaultUnitId={lease.unitId} defaultTenantId={lease.tenantId} defaultContractingPartyIds={lease.parties.filter((party) => party.role === "CONTRACTING_PARTY" && !party.isPrimary).map((party) => party.tenantId)} defaultContractNumber={lease.contractNumber} defaultStartDate={dateInput(lease.startDate)} defaultEndDate={dateInput(lease.endDate)} defaultDueDay={lease.dueDay} defaultRentTiming={lease.rentTiming} defaultVariableSymbol={lease.variableSymbol} defaultTenantBankAccount={lease.tenantBankAccount} proposals={proposals} ownerAccountsByUnit={ownerAccountsByUnit} tenantAccountsByTenant={tenantAccountsByTenant} showGenerateCharges defaultAutoChargesEnabled={lease.autoChargesEnabled} defaultIndexationEnabled={lease.indexationEnabled} defaultIndexationPercent={lease.indexationPercentBps == null ? "" : lease.indexationPercentBps / 100} defaultDeposit={moneyInput(lease.depositCents).replace(",", ".")}/>
      <Field label="Nájemné Kč / měsíc" name="rent" type="number" step="0.01" min={0} defaultValue={moneyInput(liveAmounts.rent.amountCents).replace(",", ".")}/>
      <Field label="Služby Kč / měsíc" name="services" type="number" step="0.01" min={0} defaultValue={moneyInput(liveAmounts.services.amountCents).replace(",", ".")}/>
      <Textarea label="Poznámka" name="note" defaultValue={lease.note}/>
      <div className="field field-full"><h3>Upomínky a inkaso</h3><p className="muted-copy">Dočasné pozastavení má přednost před globálním automatickým plánem.</p></div>
      <Field label="Pozastavit automatické upomínky do" name="remindersPausedUntil" type="date" defaultValue={dateInput(lease.remindersPausedUntil)}/>
      <Field label="Slíbené datum úhrady" name="promisedPaymentDate" type="date" defaultValue={dateInput(lease.promisedPaymentDate)}/>
      <Field label="Slíbená částka Kč" name="promisedAmount" type="number" step="0.01" min={0} defaultValue={lease.promisedAmountCents == null ? "" : moneyInput(lease.promisedAmountCents).replace(",", ".")}/>
      <Textarea label="Důvod pozastavení" name="reminderPauseReason" defaultValue={lease.reminderPauseReason}/>
      <Textarea label="Interní poznámka k inkasu" name="collectionNote" defaultValue={lease.collectionNote}/>
    </FormCard>
    <div className="card ownership-simple-card" id="lifecycle">
      <div className="card-head"><div><h2>Lifecycle nájemního vztahu</h2><p className="muted-copy">Nájemník ani smlouva se nemažou. Ukončení vytvoří historickou lifecycle událost a uvolní jednotku podle skutečného data.</p></div></div>
      {lifecycleStatus === "ENDED" ? <div className="summary-list">
        <div><span>Stav</span><strong>Ukončená</strong></div>
        {lease.terminatedOn && <div><span>Skutečné ukončení</span><strong>{date(lease.terminatedOn)}</strong></div>}
        {lease.terminationReason && <div><span>Důvod ukončení</span><strong>{lease.terminationReason}</strong></div>}
        {lease.cancelledAt && <div><span>Budoucí smlouva zrušena</span><strong>{date(lease.cancelledAt)}</strong></div>}
        {lease.cancellationReason && <div><span>Důvod zrušení</span><strong>{lease.cancellationReason}</strong></div>}
        {lease.cancelledAt && canReactivate && <div className="field field-full">
          <form className="compact-form" action={`/api/properties/${id}/leases/${lease.id}/reactivate`} method="post">
            <div><h3>Administrativní oprava</h3><p className="muted-copy">Tato smlouva byla zrušena před začátkem. Pokud bylo zrušení provedeno omylem nebo jde o opravu historických dat, může administrátor zrušení odstranit. Nejprve zkontrolujte správnost začátku a konce smlouvy.</p></div>
            <label className="field field-full"><span>Důvod obnovení *</span><textarea name="restoreReason" placeholder="Oprava historického testovacího záznamu" required/></label>
            <button className="secondary" type="submit">Obnovit zrušenou smlouvu</button>
          </form>
        </div>}
      </div> : <form className="compact-form" action={`/api/properties/${id}/leases/${lease.id}/terminate`} method="post">
        {lifecycleStatus === "ACTIVE" && <Field label="Skutečné datum ukončení" name="terminatedOn" type="date" defaultValue={dateInput(new Date())} required/>}
        <Textarea label={lifecycleStatus === "FUTURE" ? "Důvod zrušení budoucí smlouvy" : "Důvod ukončení"} name="reason"/>
        <button className="secondary" type="submit">{lifecycleStatus === "FUTURE" ? "Zrušit budoucí smlouvu" : "Ukončit nájemní vztah"}</button>
      </form>}
    </div>
  </FormPage></Shell>;
}
