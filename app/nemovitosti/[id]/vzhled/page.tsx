import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { loadEntityPhotoCandidates, loadEntityPhotos } from "@/lib/entity-photos";
import { loadEntityAppearances } from "@/lib/entity-appearance";
import { appearanceColors, entityAppearanceKey } from "@/lib/entity-appearance-values";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { Flash } from "@/components/FormUi";
import { EntityAvatar } from "@/components/EntityAvatar";

export default async function EntityAppearance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unitId?: string; ok?: string; error?: string }> }) {
  const user = await requireUser(), { id } = await params, query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const unit = query.unitId ? await requireUnitAccess(user, id, query.unitId) : null;
  if (query.unitId && !unit) notFound();
  const [photos, candidates, appearances] = await Promise.all([loadEntityPhotos(user, [id]), loadEntityPhotoCandidates(user, [id]), loadEntityAppearances(user.id)]);
  const preference = appearances[entityAppearanceKey(id, unit?.id)];
  const back = unit ? `/nemovitosti/${id}/jednotky/${unit.id}` : `/nemovitosti/${id}/prehled`;
  return <Shell user={user} taskPropertyId={id}><div className="page form-page">
    <div className="breadcrumb"><Link href={back}>← {unit?.label || property.name}</Link></div>
    <div className="page-title"><div><PageHeading>Vzhled {unit ? "jednotky" : "objektu"}</PageHeading><p>{unit?.label || property.name} · vaše osobní nastavení</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <form className="card edit-form" action={`/api/properties/${id}/appearance`} method="post">
      {unit && <input type="hidden" name="unitId" value={unit.id}/>}
      <div className="appearance-identity"><EntityAvatar photoId={unit ? photos.units[unit.id] : photos.properties[id]} kind={unit ? "unit" : "property"} size="lg"/><div><h2>Fotografie a avatar</h2><p className="muted-copy">Automaticky použijeme titulní fotografii, případně první dostupnou. Bez fotografie zůstane obecná ikona.</p></div></div>
      <div className="form-grid">
        <label className="field"><span>Fotografie / avatar</span><select name="photoId" defaultValue={preference?.photoId || ""}><option value="">Automaticky</option><option value="icon">Obecná ikona</option>{candidates.filter(photo => (photo.unitId || "") === (unit?.id || "")).map(photo => <option key={photo.id} value={photo.id}>{photo.title}</option>)}</select></label>
        <label className="field"><span>Barva karty v přehledu</span><select name="color" defaultValue={preference?.color || ""}>{Object.entries(appearanceColors).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="muted-copy">Barva zvýrazní {unit ? "záhlaví jednotky" : "objekt na hlavní stránce portfolia"}. Oblíbené objekty označíte hvězdičkou přímo v portfoliu. Vaše volby se ukládají k účtu a nemění nastavení ostatních uživatelů.</p>
      <div className="form-actions"><Link className="secondary" href={back}>Zpět</Link><button className="primary" type="submit">Uložit vzhled</button></div>
    </form>
  </div></Shell>;
}
