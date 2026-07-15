import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { ownerTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";
export default async function OwnerEdit({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{ok?:string;error?:string}> }) {
  const user = await requireUser();
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const { id } = await params;
  const [owner, query] = await Promise.all([prisma.owner.findUnique({ where: { id }, include: { properties: { orderBy: { name: "asc" } } } }), searchParams]);
  if (!owner) notFound();
  return <Shell user={user}><FormPage title={owner.name} description={`${owner.properties.length} spravovaných nemovitostí`} backHref="/vlastnici"><Flash ok={query.ok} error={query.error}/><FormCard action={`/api/owners/${owner.id}`} cancelHref="/vlastnici"><Field label="Název" name="name" defaultValue={owner.name} required/><Select label="Typ" name="type" defaultValue={owner.type} options={Object.entries(ownerTypes)}/><Field label="IČO" name="ico" defaultValue={owner.ico}/><Field label="E-mail" name="email" type="email" defaultValue={owner.email}/><Field label="Telefon" name="phone" defaultValue={owner.phone}/><Field label="Adresa" name="address" defaultValue={owner.address} full/><Textarea label="Poznámka" name="note" defaultValue={owner.note}/><Checkbox label="Aktivní vlastník" name="active" defaultChecked={owner.active} full/></FormCard></FormPage></Shell>;
}
