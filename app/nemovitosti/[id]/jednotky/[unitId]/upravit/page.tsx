import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";
export default async function EditUnit({ params, searchParams }: { params: Promise<{ id: string; unitId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, unitId } = await params;
  const [property, unit, owners, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" } } } }),
    prisma.owner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    searchParams,
  ]);
  if (!property || !unit) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const canManage = canSeeAll(user.role) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  if (!canManage) redirect(`/nemovitosti/${id}/jednotky/${unitId}`);
  const currentOwner = unit.ownerships[0]?.ownerId || property.ownerId;
  return <Shell user={user}><FormPage title={`Upravit jednotku ${unit.label}`} description={property.name} backHref={`/nemovitosti/${id}/jednotky/${unit.id}`}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/units/${unit.id}`} cancelHref={`/nemovitosti/${id}/jednotky/${unit.id}`}>
      <Field label="Označení jednotky" name="label" defaultValue={unit.label} required/>
      <Field label="Podlaží" name="floor" defaultValue={unit.floor}/>
      <Select label="Typ jednotky" name="type" defaultValue={unit.type} options={Object.entries(unitTypes)}/>
      <Select label="Stav" name="status" defaultValue={unit.status} options={Object.entries(unitStatuses)}/>
      <Field label="Plocha v m²" name="areaM2" type="number" step="0.01" min={0} defaultValue={unit.areaM2}/>
      <Textarea label="Poznámka" name="note" defaultValue={unit.note}/>
    </FormCard>
    <div className="card ownership-simple-card">
      <div className="card-head"><div><h2>Vlastník jednotky</h2><p className="muted-copy">Vyberte aktuálního vlastníka. Změna nahradí předchozí vazbu; procentní podíly se již neevidují.</p></div></div>
      <form className="owner-replace-form" action={`/api/properties/${id}/units/${unit.id}/ownerships`} method="post">
        <label className="field"><span>Vlastník</span><select name="ownerId" defaultValue={currentOwner} required>{owners.map((owner)=><option value={owner.id} key={owner.id}>{owner.name}{owner.ico ? ` · IČO ${owner.ico}` : ""}</option>)}</select></label>
        <input type="hidden" name="replace" value="true"/>
        <button className="primary" type="submit">Uložit vlastníka</button>
      </form>
      <Link className="table-link inline-profile-link" href={`/vlastnici/${currentOwner}`}>Otevřít profil vlastníka →</Link>
    </div>
  </FormPage></Shell>;
}
