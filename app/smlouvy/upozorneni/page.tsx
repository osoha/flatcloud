import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { date } from "@/lib/format";
import { leaseAlertsForProperties } from "@/lib/lease-alerts";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function LeaseAlertsPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; kind?: string }> }) {
  const user = await requireUser();
  const [allProperties, query] = await Promise.all([accessibleProperties(user), searchParams]);
  const properties = query.propertyId ? allProperties.filter((property) => property.id === query.propertyId) : allProperties;
  const allAlerts = leaseAlertsForProperties(properties);
  const expiry = allAlerts.filter((row) => row.kind === "EXPIRY").length;
  const anniversaries = allAlerts.filter((row) => row.kind === "ANNIVERSARY").length;
  const alerts = query.kind === "expiry" ? allAlerts.filter((row) => row.kind === "EXPIRY") : query.kind === "anniversary" ? allAlerts.filter((row) => row.kind === "ANNIVERSARY") : allAlerts;
  const scope = query.propertyId && properties[0] ? ` · ${properties[0].name}` : "";
  return <Shell user={user} taskPropertyId={query.propertyId}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Smlouvy do 3 měsíců</span></div>
    <div className="page-title"><div><h1>Expirace a výročí smluv{scope}</h1><p>Aktivní nájemní smlouvy s koncem nebo nejbližším výročím v následujících 3 kalendářních měsících.</p></div>{query.propertyId && <Link className="secondary" href="/smlouvy/upozorneni">Zobrazit celé portfolio</Link>}</div>
    <div className="task-status-tabs"><Link className={!query.kind?"active":""} href={`/smlouvy/upozorneni${query.propertyId?`?propertyId=${query.propertyId}`:""}`}>Vše</Link><Link className={query.kind==="expiry"?"active":""} href={`/smlouvy/upozorneni?kind=expiry${query.propertyId?`&propertyId=${query.propertyId}`:""}`}>Expirace</Link><Link className={query.kind==="anniversary"?"active":""} href={`/smlouvy/upozorneni?kind=anniversary${query.propertyId?`&propertyId=${query.propertyId}`:""}`}>Výročí</Link></div>
    <div className="stat-grid"><MiniStat label="Události" value={String(allAlerts.length)} note="do 3 měsíců"/><MiniStat label="Expirace" value={String(expiry)} note="konec doby nájmu" bad={expiry > 0}/><MiniStat label="Výročí" value={String(anniversaries)} note="výročí počátku smlouvy"/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Kalendář smluv</h2><p>Seřazeno od nejbližší události.</p></div></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Typ</th><th>Nemovitost</th><th>Jednotka</th><th>Nájemník</th><th>Smlouva</th><th></th></tr></thead><tbody>{alerts.length ? alerts.map((row, index) => <tr key={`${row.lease.id}-${row.kind}-${index}`}><td><strong>{date(row.date)}</strong></td><td><span className={`status ${row.kind === "EXPIRY" ? "warn" : "ok"}`}>{row.kind === "EXPIRY" ? "Expirace" : "Výročí"}</span></td><td><Link className="entity-link" href={`/nemovitosti/${row.property.id}/prehled`}>{row.property.name}</Link></td><td>{row.lease.unit.label}</td><td>{row.lease.tenant.name}</td><td>{row.lease.contractNumber || "Bez čísla"}</td><td><Link className="table-link" href={`/smlouvy/${row.lease.id}`}>Detail smlouvy</Link></td></tr>) : <tr><td className="table-empty" colSpan={7}>V příštích 3 měsících není evidována expirace ani výročí aktivní smlouvy.</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}

function MiniStat({label,value,note,bad=false}:{label:string;value:string;note:string;bad?:boolean}) { return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>{note}</small></div></div>; }
