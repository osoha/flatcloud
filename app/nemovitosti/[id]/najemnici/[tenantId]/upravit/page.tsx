import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { TenantFields } from "@/components/TenantFields";

export const dynamic = "force-dynamic";

export default async function EditTenant({ params, searchParams }: { params: Promise<{ id: string; tenantId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, tenantId } = await params;
  const [property, tenant, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.tenant.findFirst({ where: { id: tenantId, OR: [{ leases: { some: { unit: unitAccessWhere(user, id) } } }, { leaseParties: { some: { lease: { unit: unitAccessWhere(user, id) } } } }] } }),
    searchParams,
  ]);
  if (!property || !tenant) notFound();
  const relationship = await prisma.lease.findFirst({ where: { unit: unitAccessWhere(user, id), OR: [{ tenantId: tenant.id }, { parties: { some: { tenantId: tenant.id, role: "CONTRACTING_PARTY" } } }] }, orderBy: { startDate: "desc" }, select: { unitId: true } });
  const unitId = relationship?.unitId;
  const backHref = unitId ? `/nemovitosti/${id}/jednotky/${unitId}` : `/nemovitosti/${id}/najemnici`;
  return <Shell user={user}><FormPage title={`Upravit nájemníka: ${tenant.name}`} backHref={backHref}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/tenants/${tenant.id}`} cancelHref={`/nemovitosti/${id}/najemnici`}>
      <TenantFields typeName="type" noteName="note" defaults={{ type: tenant.type, name: tenant.name, email: tenant.email, phone: tenant.phone, ico: tenant.ico, permanentAddress: tenant.permanentAddress || (tenant.type === "PERSON" ? tenant.address : null), correspondenceAddress: tenant.correspondenceAddress, billingAddress: tenant.billingAddress || (tenant.type === "COMPANY" ? tenant.address : null), billingEmail: tenant.billingEmail, communicationEmail: tenant.communicationEmail, note: tenant.note }}/>
      <Textarea label="Známé účty plátce" name="payerAccounts" defaultValue={tenant.payerAccounts.join("\n")} placeholder="Jeden účet na řádek"/>
      <div className="field field-full notice"><strong>Nájemník se neukončuje ani nemaže</strong><span>Historie nájemních vztahů zůstává zachována. Ukončení se provádí vždy na konkrétní smlouvě.</span></div>
    </FormCard>
  </FormPage></Shell>;
}
