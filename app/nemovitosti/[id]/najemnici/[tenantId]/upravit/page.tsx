import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, unitAccessWhere } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Checkbox, Flash, FormCard, FormPage, Textarea } from "@/components/FormUi";
import { TenantFields } from "@/components/TenantFields";

export const dynamic = "force-dynamic";

export default async function EditTenant({ params, searchParams }: { params: Promise<{ id: string; tenantId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, tenantId } = await params;
  const [property, tenant, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.tenant.findFirst({ where: { id: tenantId, leases: { some: { unit: unitAccessWhere(user, id) } } } }),
    searchParams,
  ]);
  if (!property || !tenant) notFound();
  const unitId = property.units.find((unit) => unit.leases.some((lease) => lease.tenantId === tenant.id))?.id;
  const backHref = unitId ? `/nemovitosti/${id}/jednotky/${unitId}` : `/nemovitosti/${id}/najemnici`;
  return <Shell user={user}><FormPage title={`Upravit nájemníka: ${tenant.name}`} backHref={backHref}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/tenants/${tenant.id}`} cancelHref={`/nemovitosti/${id}/najemnici`}>
      <TenantFields typeName="type" noteName="note" defaults={{ type: tenant.type, name: tenant.name, email: tenant.email, phone: tenant.phone, ico: tenant.ico, permanentAddress: tenant.permanentAddress || (tenant.type === "PERSON" ? tenant.address : null), correspondenceAddress: tenant.correspondenceAddress, billingAddress: tenant.billingAddress || (tenant.type === "COMPANY" ? tenant.address : null), billingEmail: tenant.billingEmail, communicationEmail: tenant.communicationEmail, note: tenant.note }}/>
      <Textarea label="Známé účty plátce" name="payerAccounts" defaultValue={tenant.payerAccounts.join("\n")} placeholder="Jeden účet na řádek"/>
      <Checkbox label="Aktivní nájemník" name="active" defaultChecked={tenant.active} full/>
    </FormCard>
  </FormPage></Shell>;
}
