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
  if (!canManage) redirect(`/nemovitosti/${id}/jednotky`);
  return <Shell user={user}><FormPage title={`Upravit jednotku ${unit.label}`} description={property.name} backHref={`/nemovitosti/${id}/jednotky`}>
    <Flash ok={query.ok} error={query.error}/>
    <FormCard action={`/api/properties/${id}/units/${unit.id}`} cancelHref={`/nemovitosti/${id}/jednotky`}><Field label="Označení jednotky" name="label" defaultValue={unit.label} required/><Field label="Podlaží" name="floor" defaultValue={unit.floor}/><Select label="Typ jednotky" name="type" defaultValue={unit.type} options={Object.entries(unitTypes)}/><Select label="Stav" name="status" defaultValue={unit.status} options={Object.entries(unitStatuses)}/><Field label="Plocha v m²" name="areaM2" type="number" step="0.01" min={0} defaultValue={unit.areaM2}/><Textarea label="Poznámka" name="note" defaultValue={unit.note}/></FormCard>
    <div className="detail-grid ownership-editor">
      <div className="card col-7"><div className="card-head"><h2>Vlastníci jednotky</h2></div>{unit.ownerships.length ? <div className="stack-list">{unit.ownerships.map((ownership) => <form className="inline-edit-card" action={`/api/properties/${id}/units/${unit.id}/ownerships/${ownership.id}`} method="post" key={ownership.id}><div className="inline-edit-grid"><label className="field"><span>Vlastník</span><input value={ownership.owner.name} readOnly/></label><label className="field"><span>Podíl %</span><input name="sharePercent" type="number" min="0.01" max="100" step="0.01" defaultValue={ownership.shareBasisPoints / 100}/></label><label className="field"><span>Poznámka</span><input name="note" defaultValue={ownership.note || ""}/></label></div>{canManage && <div className="mini-actions"><button className="secondary" type="submit">Uložit</button><button className="danger-button" type="submit" name="mode" value="delete">Odebrat</button></div>}</form>)}</div> : <p className="muted-copy">Vlastník jednotky zatím není nastaven.</p>}</div>
      <div className="card col-5"><h2>Přidat vlastníka jednotky</h2><p className="muted-copy">Pro běžný byt v SVJ nastavte vlastníka na 100 %. U spoluvlastnictví přidejte více osob a jejich podíly.</p>{canManage && <form className="compact-form" action={`/api/properties/${id}/units/${unit.id}/ownerships`} method="post"><label className="field"><span>Vlastník</span><select name="ownerId" required>{owners.map((owner) => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Podíl %</span><input name="sharePercent" type="number" min="0.01" max="100" step="0.01" defaultValue="100" required/></label><label className="field"><span>Poznámka</span><input name="note"/></label><button className="primary" type="submit">Přidat vlastníka</button></form>}</div>
    </div>
  </FormPage></Shell>;
}
