import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { date } from "@/lib/format";
import { leaseAlertsForProperties } from "@/lib/lease-alerts";
import { Shell } from "@/components/Shell";
import { NavigableTableRow } from "@/components/NavigableTableRow";
import { parsePortfolioSelection, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";

export const dynamic = "force-dynamic";

export default async function LeaseAlertsPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; properties?: string; kind?: string }> }) {
  const user = await requireUser();
  const [allProperties, query] = await Promise.all([accessibleProperties(user), searchParams]);
  const selection = query.properties === undefined ? { mode: "ALL" } as const : parsePortfolioSelection({ properties: query.properties });
  const selectedIds = selectedPropertyIds(selection, allProperties.map((property) => property.id));
  const selectedIdSet = new Set(selectedIds);
  const scopedProperties = allProperties.filter((property) => selectedIdSet.has(property.id));
  const propertyId = query.propertyId && selectedIdSet.has(query.propertyId) ? query.propertyId : "";
  const properties = propertyId ? scopedProperties.filter((property) => property.id === propertyId) : scopedProperties;
  const allAlerts = leaseAlertsForProperties(properties);
  const expiry = allAlerts.filter((row) => row.kind === "EXPIRY").length;
  const anniversaries = allAlerts.filter((row) => row.kind === "ANNIVERSARY").length;
  const alerts = query.kind === "expiry" ? allAlerts.filter((row) => row.kind === "EXPIRY") : query.kind === "anniversary" ? allAlerts.filter((row) => row.kind === "ANNIVERSARY") : allAlerts;
  const scope = propertyId && properties[0] ? ` · ${properties[0].name}` : "";
  const selectionValue = serializePortfolioSelection(selection);
  const href = (path: string, kind?: string, includeProperty = true) => { const params = new URLSearchParams(); if (selectionValue !== null) params.set("properties", selectionValue); if (includeProperty && propertyId) params.set("propertyId", propertyId); if (kind) params.set("kind", kind); return `${path}${params.size ? `?${params}` : ""}`; };
  return <Shell user={user} taskPropertyId={propertyId || undefined}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={href("/smlouvy")}>Smlouvy / katalog</Link><span>›</span><span>Expirace a výročí</span></div>
    <div className="page-title"><div><h1>Expirace a výročí smluv{scope}</h1><p>Aktivní nájemní smlouvy s koncem nebo nejbližším výročím v následujících 3 kalendářních měsících.</p></div>{propertyId && <Link className="secondary" href={href("/smlouvy/upozorneni", undefined, false)}>Zobrazit celý zvolený rozsah</Link>}</div>
    <nav className="registry-tabs"><Link className="registry-tab" href={href("/smlouvy")}>Smlouvy / katalog</Link><Link className={`registry-tab ${!query.kind?"active":""}`} href={href("/smlouvy/upozorneni")}>Vše</Link><Link className={`registry-tab ${query.kind==="expiry"?"active":""}`} href={href("/smlouvy/upozorneni", "expiry")}>Expirace</Link><Link className={`registry-tab ${query.kind==="anniversary"?"active":""}`} href={href("/smlouvy/upozorneni", "anniversary")}>Výročí</Link></nav>
    <div className="stat-grid"><MiniStat label="Události" value={String(allAlerts.length)} note="do 3 měsíců"/><MiniStat label="Expirace" value={String(expiry)} note="konec doby nájmu" bad={expiry > 0}/><MiniStat label="Výročí" value={String(anniversaries)} note="výročí počátku smlouvy"/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Kalendář smluv</h2><p>Seřazeno od nejbližší události.</p></div></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Typ</th><th>Nemovitost</th><th>Jednotka</th><th>Nájemník</th><th>Smlouva</th><th></th></tr></thead><tbody>{alerts.length ? alerts.map((row, index) => <NavigableTableRow href={`/smlouvy/${row.lease.id}`} ariaLabel={`Otevřít smlouvu ${row.lease.contractNumber || row.lease.tenant.name}`} key={`${row.lease.id}-${row.kind}-${index}`}><td><strong>{date(row.date)}</strong></td><td><span className={`status ${row.kind === "EXPIRY" ? "warn" : "ok"}`}>{row.kind === "EXPIRY" ? "Expirace" : "Výročí"}</span></td><td><Link className="entity-link" href={`/nemovitosti/${row.property.id}/prehled`}>{row.property.name}</Link></td><td><Link className="entity-link" href={`/nemovitosti/${row.property.id}/jednotky/${row.lease.unit.id}`}>{row.lease.unit.label}</Link></td><td><Link className="entity-link" href={`/najemnici/${row.lease.tenant.id}`}>{row.lease.tenant.name}</Link></td><td><Link className="entity-link" href={`/smlouvy/${row.lease.id}`}>{row.lease.contractNumber || "Bez čísla"}</Link></td><td><Link className="table-link" href={`/smlouvy/${row.lease.id}`}>Detail smlouvy</Link></td></NavigableTableRow>) : <tr><td className="table-empty" colSpan={7}>V příštích 3 měsících není evidována expirace ani výročí aktivní smlouvy.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}

function MiniStat({label,value,note,bad=false}:{label:string;value:string;note:string;bad?:boolean}) { return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>{note}</small></div></div>; }
