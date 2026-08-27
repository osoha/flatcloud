import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { tenantAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const tenants = await prisma.tenant.findMany({ where: tenantAccessWhere(user), include: { leases: { include: { unit: { include: { property: true } } } } }, orderBy: { name: "asc" } });
  const rows = tenants.map((tenant) => {
    const statuses = tenant.leases.map((lease) => leaseStatusAt(lease));
    const status = statuses.includes("ACTIVE") ? "ACTIVE" : statuses.includes("FUTURE") ? "FUTURE" : "ENDED";
    return { tenant, status };
  }).filter((row) => !query.status || query.status === "ALL" || row.status === query.status);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Nájemníci</h1><p>Master profily osob a firem napříč dostupným portfoliem.</p></div><Link className="primary" href="/portfolio#nemovitosti">Nový nájemník</Link></div><div className="tabs"><Link className={!query.status || query.status === "ALL" ? "active" : ""} href="/najemnici?status=ALL">Všichni</Link><Link className={query.status === "ACTIVE" ? "active" : ""} href="/najemnici?status=ACTIVE">Aktuální</Link><Link className={query.status === "FUTURE" ? "active" : ""} href="/najemnici?status=FUTURE">Budoucí</Link><Link className={query.status === "ENDED" ? "active" : ""} href="/najemnici?status=ENDED">Bývalí</Link></div><div className="card table-wrap"><table><thead><tr><th>Nájemník</th><th>Typ</th><th>Stav</th><th>Smluv</th></tr></thead><tbody>{rows.map(({ tenant, status }) => <tr key={tenant.id}><td><Link href={`/najemnici/${tenant.id}`}><strong>{tenant.name}</strong></Link><small>{tenant.email || tenant.phone || ""}</small></td><td>{tenant.type === "COMPANY" ? "Společnost" : "Osoba"}</td><td>{leaseStatuses[status]}</td><td>{tenant.leases.length}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="muted-copy">Žádní nájemníci v tomto pohledu.</td></tr>}</tbody></table></div></div></Shell>;
}
