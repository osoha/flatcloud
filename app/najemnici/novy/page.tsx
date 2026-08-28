import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, hasManageableProperty } from "@/lib/access";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function NewTenantEntry() {
  const user = await requireUser();
  const properties = (await accessibleProperties(user)).filter((property) => hasManageableProperty(user, property));
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Nový nájemník</h1><p>Nájemník se zakládá spolu s první nájemní smlouvou. Vyberte nemovitost, ve které bude první nájemní vztah.</p></div></div>{properties.length ? <div className="registry-property-grid">{properties.map((property) => <article className="card registry-property-card" key={property.id}><h2>{property.name}</h2><p>{property.address}, {property.city}</p><small>{property.units.length} jednotek</small><Link className="primary" href={`/nemovitosti/${property.id}/najemnici/novy`}>Pokračovat</Link></article>)}</div> : <div className="card empty-state"><h2>Žádná spravovatelná nemovitost</h2><p>Nemáte oprávnění EDIT nebo ADMIN k žádné nemovitosti, kde lze založit nájemní vztah.</p></div>}</div></Shell>;
}