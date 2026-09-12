import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, hasManageableProperty } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { parsePortfolioSelection, selectedPropertyIds } from "@/lib/portfolio-selection";

export const dynamic = "force-dynamic";

export default async function NewLeaseEntry({ searchParams }: { searchParams: Promise<{ properties?: string }> }) {
  const user = await requireUser();
  const [available, query] = await Promise.all([accessibleProperties(user), searchParams]);
  const selection = query.properties === undefined ? { mode: "ALL" } as const : parsePortfolioSelection({ properties: query.properties });
  const selected = new Set(selectedPropertyIds(selection, available.map((property) => property.id)));
  const properties = available.filter((property) => selected.has(property.id) && hasManageableProperty(user, property));
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Nová smlouva</h1><p>Vyberte spravovatelnou nemovitost, ve které smlouvu založíte.</p></div></div>{properties.length ? <div className="registry-property-grid">{properties.map((property) => <article className="card registry-property-card" key={property.id}><h2>{property.name}</h2><p>{property.address}, {property.city}</p><small>{property.units.length} jednotek</small><Link className="primary" href={`/nemovitosti/${property.id}/smlouvy/nova`}>Pokračovat</Link></article>)}</div> : <div className="card empty-state"><h2>Žádná spravovatelná nemovitost</h2><p>Nemáte oprávnění k založení smlouvy.</p></div>}</div></Shell>;
}
