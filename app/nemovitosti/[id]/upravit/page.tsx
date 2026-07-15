import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";

export const dynamic = "force-dynamic";
export default async function EditProperty({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{ok?:string;error?:string}> }) {
  const user = await requireUser(); const { id } = await params;
  const [property, owners, query] = await Promise.all([requirePropertyAccess(user,id), prisma.owner.findMany({ where: { active: true }, orderBy: { name: "asc" } }), searchParams]);
  if (!property) notFound();
  return <Shell user={user}><FormPage title={`Upravit: ${property.name}`} backHref={`/nemovitosti/${id}/nastaveni`}><Flash ok={query.ok} error={query.error}/><FormCard action={`/api/properties/${id}`} cancelHref={`/nemovitosti/${id}/nastaveni`}><Field label="Interní název" name="name" defaultValue={property.name} required/>{canSeeAll(user.role)?<Select label="Vlastník / SPV" name="ownerId" defaultValue={property.ownerId} options={owners.map(o=>[o.id,o.name])}/>:<input type="hidden" name="ownerId" value=""/>}<Field label="Ulice a číslo" name="address" defaultValue={property.address} required/><Field label="Město" name="city" defaultValue={property.city} required/><Field label="PSČ" name="postalCode" defaultValue={property.postalCode}/><Textarea label="Interní poznámka" name="note" defaultValue={property.note}/><Checkbox label="Aktivní nemovitost" name="active" defaultChecked={property.active} full/></FormCard></FormPage></Shell>;
}
