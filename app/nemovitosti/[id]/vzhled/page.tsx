import { EntityAvatarChoice } from "@/components/EntityAvatarChoice";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasAllPropertyAccess, canManageProperty } from "@/lib/auth";
import { requirePropertyAccess, requireUnitAccess } from "@/lib/access";
import { loadEntityPhotoCandidates, loadEntityPhotos } from "@/lib/entity-photos";
import { loadEntityAppearances } from "@/lib/entity-appearance";
import { appearanceColors, entityAppearanceKey } from "@/lib/entity-appearance-values";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { Flash } from "@/components/FormUi";
import { EntityAvatar } from "@/components/EntityAvatar";
import { defaultPropertyIllustration } from "@/lib/illustration-library";

export default async function EntityAppearance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unitId?: string; ok?: string; error?: string }> }) {
  const user = await requireUser(), { id } = await params, query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const unit = query.unitId ? await requireUnitAccess(user, id, query.unitId) : null;
  if (query.unitId && !unit) notFound();
  const [photos, candidates, appearances] = await Promise.all([loadEntityPhotos(user, [id]), loadEntityPhotoCandidates(user, [id]), loadEntityAppearances(user.id)]);
  const preference = appearances[entityAppearanceKey(id, unit?.id)];
  const canEditShared = (canManageProperty(user.role) && hasAllPropertyAccess(user)) || property.memberships.some(member => member.userId === user.id && ["EDIT", "ADMIN"].includes(member.permission));
  const defaultChoice = unit ? defaultPropertyIllustration("unit", id, property.units.findIndex(item => item.id === unit.id)) : defaultPropertyIllustration("house", id);
  const back = unit ? `/nemovitosti/${id}/jednotky/${unit.id}` : `/nemovitosti/${id}/prehled`;
  return <Shell user={user} taskPropertyId={id}><div className="page form-page">
    <div className="breadcrumb"><Link href={back}>← {unit?.label || property.name}</Link></div>
    <div className="page-title"><div><PageHeading>Upravit kartu</PageHeading><p>{unit?.label || property.name} · {unit ? "vaše osobní nastavení" : "avatar domu společný pro všechny uživatele, barva karty osobní"}</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <form className="card edit-form" action={`/api/properties/${id}/appearance`} method="post" encType="multipart/form-data">
      {unit && <input type="hidden" name="unitId" value={unit.id}/>}
      <div className="appearance-identity"><EntityAvatar photoId={(unit ? photos.units[unit.id] : photos.properties[id]) || defaultChoice} kind={unit ? "unit" : "property"} size="lg"/><div><h2>Fotografie a avatar</h2><p className="muted-copy">V Basic můžete vybrat ilustraci z knihovny. V Profi se bez vlastní fotografie zobrazuje jednoduchá ikona.</p></div></div>
      <div className="form-grid">
        {(unit || canEditShared) && <EntityAvatarChoice kind={unit ? "unit" : "house"} selected={(unit ? preference?.photoId : property.avatarPhotoId) || defaultChoice} photos={candidates.filter(photo => (photo.unitId || "") === (unit?.id || "")).map(photo => ({id:photo.id,title:photo.title}))}/>}
        <label className="field"><span>Barva karty v přehledu</span><select name="color" defaultValue={preference?.color || ""}>{Object.entries(appearanceColors).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="muted-copy">Barva zvýrazní {unit ? "záhlaví jednotky" : "objekt na hlavní stránce portfolia"}. Oblíbené objekty označíte hvězdičkou přímo v portfoliu. {unit ? "Avatar jednotky i barva jsou osobní." : "Avatar domu se ukáže všem s přístupem k objektu; barva a oblíbené zůstávají osobní."}</p>
      <div className="form-actions"><Link className="secondary" href={back}>Zpět</Link><button className="primary" type="submit">Uložit kartu</button></div>
    </form>
  </div></Shell>;
}
