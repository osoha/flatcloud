import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { tenantAccessWhere, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { NavigableTableRow } from "@/components/NavigableTableRow";
import { phone } from "@/lib/format";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = { ACTIVE: "Aktuální", FUTURE: "Budoucí", ENDED: "Bývalý", PROFILE: "Bez smlouvy" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const tenants = await prisma.tenant.findMany({ where: tenantAccessWhere(user), include: { leases: { where: leaseAccessWhere(user), include: { unit: { include: { property: true } } } }, leaseParties: { where: { lease: leaseAccessWhere(user) }, include: { lease: { include: { unit: { include: { property: true } } } } } } }, orderBy: { name: "asc" } });
  const rows = tenants.map((tenant) => { const relationships = Array.from(new Map([...tenant.leases, ...tenant.leaseParties.map((party) => party.lease)].map((lease) => [lease.id, lease])).values()); const status = !relationships.length ? "PROFILE" : relationships.some((lease) => leaseStatusAt(lease) === "ACTIVE") ? "ACTIVE" : relationships.some((lease) => leaseStatusAt(lease) === "FUTURE") ? "FUTURE" : "ENDED"; const relationship = relationships.find((lease) => leaseStatusAt(lease) === "ACTIVE") || relationships.find((lease) => leaseStatusAt(lease) === "FUTURE") || relationships[0]; return { tenant, relationships, status, relationship }; });
  const counts = { ALL: rows.length, ACTIVE: rows.filter((row) => row.status === "ACTIVE").length, FUTURE: rows.filter((row) => row.status === "FUTURE").length, ENDED: rows.filter((row) => row.status === "ENDED").length, PROFILE: rows.filter((row) => row.status === "PROFILE").length };
  const view = query.status || "ALL";
  const visible = rows.filter((row) => view === "ALL" || row.status === view);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Nájemníci</h1><p>Master profily osob a firem napříč dostupným portfoliem.</p></div><Link className="primary" href="/najemnici/novy">Nový profil</Link></div><nav className="registry-tabs"><Link className={`registry-tab ${view === "ALL" ? "active" : ""}`} href="/najemnici?status=ALL">Všichni {counts.ALL}</Link><Link className={`registry-tab ${view === "ACTIVE" ? "active" : ""}`} href="/najemnici?status=ACTIVE">Aktuální {counts.ACTIVE}</Link><Link className={`registry-tab ${view === "FUTURE" ? "active" : ""}`} href="/najemnici?status=FUTURE">Budoucí {counts.FUTURE}</Link><Link className={`registry-tab ${view === "ENDED" ? "active" : ""}`} href="/najemnici?status=ENDED">Bývalí {counts.ENDED}</Link><Link className={`registry-tab ${view === "PROFILE" ? "active" : ""}`} href="/najemnici?status=PROFILE">Bez smlouvy {counts.PROFILE}</Link></nav><div className="card table-wrap"><table className="registry-table"><thead><tr><th>Nájemník</th><th>Aktuální / poslední vztah</th><th>Typ</th><th>Stav</th><th>Smluv</th></tr></thead><tbody>{visible.map(({ tenant, relationships, relationship, status }) => <NavigableTableRow href={`/najemnici/${tenant.id}`} ariaLabel={`Otevřít nájemníka ${tenant.name}`} key={tenant.id}><td><Link className="entity-primary" href={`/najemnici/${tenant.id}`}>{tenant.name}</Link><span className="entity-secondary">{tenant.email || phone(tenant.phone) || "Bez kontaktu"}</span></td><td>{relationship ? <><Link className="registry-context" href={`/smlouvy/${relationship.id}`}>{relationship.unit.property.name}</Link><span className="entity-secondary">{relationship.unit.label}</span></> : <span className="entity-secondary">Profil připraven k přiřazení</span>}</td><td>{tenant.type === "COMPANY" ? "Společnost" : "Osoba"}</td><td>{labels[status]}</td><td>{relationships.length}</td></NavigableTableRow>)}{!visible.length && <tr><td colSpan={5} className="muted-copy">Žádní nájemníci v tomto pohledu.</td></tr>}</tbody></table></div></div></Shell>;
}
