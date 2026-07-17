import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { TenantFields } from "@/components/TenantFields";
import { LeaseCoreFields } from "@/components/LeaseCoreFields";
import { dateInput } from "@/lib/forms";
import { proposedVariableSymbol } from "@/lib/variable-symbol";

export const dynamic = "force-dynamic";

export default async function NewTenant({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; unitId?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [property, query, usedRows] = await Promise.all([
    requirePropertyAccess(user, id),
    searchParams,
    prisma.lease.findMany({ select: { variableSymbol: true } }),
  ]);
  if (!property) notFound();
  const freeUnits = property.units.filter((unit) => !unit.leases.some((lease) => lease.status === "ACTIVE"));
  const used = new Set(usedRows.map((row) => row.variableSymbol));
  const proposals = Object.fromEntries(freeUnits.map((unit) => [unit.id, proposedVariableSymbol(property, unit, used)]));

  return <Shell user={user}><FormPage title="Nový nájemník a smlouva" description="Nájemník bude rovnou přiřazen ke konkrétní jednotce. Kontaktní údaje se přizpůsobí fyzické nebo právnické osobě." backHref={`/nemovitosti/${id}/najemnici`}>
    <Flash ok={query.ok} error={query.error}/>
    {freeUnits.length ? <FormCard action={`/api/properties/${id}/tenants`} cancelHref={`/nemovitosti/${id}/najemnici`} submitLabel="Vytvořit nájemníka a smlouvu">
      <h2 className="form-section-title field-full">Nájemník</h2>
      <TenantFields/>
      <Textarea label="Známé účty plátce" name="payerAccounts" placeholder="Jeden účet na řádek nebo oddělený čárkou"/>
      <h2 className="form-section-title field-full">Nájemní smlouva</h2>
      <LeaseCoreFields unitOptions={freeUnits.map((unit) => [unit.id, `${unit.label}${unit.floor ? ` · ${unit.floor}` : ""}`])} defaultUnitId={query.unitId} defaultStartDate={dateInput(new Date())} proposals={proposals}/>
      <Field label="Nájemné Kč / měsíc" name="rent" type="number" step="0.01" min={0} required/>
      <Field label="Zálohy na služby Kč / měsíc" name="services" type="number" step="0.01" min={0}/>
      <Field label="Kauce Kč" name="deposit" type="number" step="0.01" min={0}/>
      <Textarea label="Poznámka ke smlouvě" name="leaseNote"/>
    </FormCard> : <div className="card empty-state"><h2>Nejprve přidejte volnou jednotku</h2><p>V objektu není jednotka bez aktivní smlouvy.</p></div>}
  </FormPage></Shell>;
}
