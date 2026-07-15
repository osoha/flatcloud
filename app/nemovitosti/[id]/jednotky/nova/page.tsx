import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";
export default async function NewUnit({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{ok?:string;error?:string}> }) {
  const user=await requireUser(); const {id}=await params; const [property,query]=await Promise.all([requirePropertyAccess(user,id),searchParams]); if(!property)notFound();
  return <Shell user={user}><FormPage title="Přidat jednotku" description={property.name} backHref={`/nemovitosti/${id}/jednotky`}><Flash ok={query.ok} error={query.error}/><FormCard action={`/api/properties/${id}/units`} cancelHref={`/nemovitosti/${id}/jednotky`} submitLabel="Přidat jednotku"><Field label="Označení jednotky" name="label" required placeholder="např. Byt 12 nebo 3.02"/><Field label="Podlaží" name="floor" placeholder="např. 3. NP"/><Select label="Typ jednotky" name="type" options={Object.entries(unitTypes)}/><Select label="Stav" name="status" options={Object.entries(unitStatuses)}/><Field label="Plocha v m²" name="areaM2" type="number" step="0.01" min={0}/><Textarea label="Poznámka" name="note"/></FormCard></FormPage></Shell>;
}
