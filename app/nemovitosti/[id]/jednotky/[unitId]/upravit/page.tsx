import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic="force-dynamic";
export default async function EditUnit({params,searchParams}:{params:Promise<{id:string;unitId:string}>;searchParams:Promise<{ok?:string;error?:string}>}){const user=await requireUser();const {id,unitId}=await params;const [property,unit,query]=await Promise.all([requirePropertyAccess(user,id),prisma.unit.findFirst({where:{id:unitId,propertyId:id}}),searchParams]);if(!property||!unit)notFound();return <Shell user={user}><FormPage title={`Upravit jednotku ${unit.label}`} description={property.name} backHref={`/nemovitosti/${id}/jednotky`}><Flash ok={query.ok} error={query.error}/><FormCard action={`/api/properties/${id}/units/${unit.id}`} cancelHref={`/nemovitosti/${id}/jednotky`}><Field label="Označení jednotky" name="label" defaultValue={unit.label} required/><Field label="Podlaží" name="floor" defaultValue={unit.floor}/><Select label="Typ jednotky" name="type" defaultValue={unit.type} options={Object.entries(unitTypes)}/><Select label="Stav" name="status" defaultValue={unit.status} options={Object.entries(unitStatuses)}/><Field label="Plocha v m²" name="areaM2" type="number" step="0.01" min={0} defaultValue={unit.areaM2}/><Textarea label="Poznámka" name="note" defaultValue={unit.note}/></FormCard></FormPage></Shell>}
