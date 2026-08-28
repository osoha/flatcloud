import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date, money } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";

export const dynamic = "force-dynamic";

export default async function LeasesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const leases = await prisma.lease.findMany({ where: leaseAccessWhere(user), include: { tenant: true, unit: { include: { property: true } } }, orderBy: { startDate: "desc" } });
  const counts = { ACTIVE: leases.filter((lease) => leaseStatusAt(lease) === "ACTIVE").length, FUTURE: leases.filter((lease) => leaseStatusAt(lease) === "FUTURE").length, HISTORY: leases.filter((lease) => leaseStatusAt(lease) === "ENDED").length };
  const view = query.view || "ACTIVE";
  const rows = leases.filter((lease) => view === "ALL" || view === "HISTORY" ? view === "HISTORY" ? leaseStatusAt(lease) === "ENDED" : true : leaseStatusAt(lease) === view);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Smlouvy</h1><p>Globální přehled nájemních vztahů v rozsahu vašich oprávnění.</p></div><Link className="primary" href="/smlouvy/nova">Nová smlouva</Link></div><nav className="registry-tabs"><Link className={`registry-tab ${view === "ACTIVE" ? "active" : ""}`} href="/smlouvy?view=ACTIVE">Aktuální {counts.ACTIVE}</Link><Link className={`registry-tab ${view === "FUTURE" ? "active" : ""}`} href="/smlouvy?view=FUTURE">Budoucí {counts.FUTURE}</Link><Link className={`registry-tab ${view === "HISTORY" ? "active" : ""}`} href="/smlouvy?view=HISTORY">Historie {counts.HISTORY}</Link><Link className="registry-tab" href="/smlouvy/upozorneni">Upozornění</Link></nav><div className="card table-wrap"><table className="registry-table"><thead><tr><th>Nájemník</th><th>Nemovitost / jednotka</th><th>Číslo smlouvy</th><th>Období</th><th>Měsíčně</th><th>Stav</th></tr></thead><tbody>{rows.map((lease) => <tr key={lease.id}><td><Link className="entity-primary" href={`/najemnici/${lease.tenantId}`}>{lease.tenant.name}</Link></td><td><Link className="registry-context" href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unit.id}`}>{lease.unit.property.name}</Link><span className="entity-secondary">{lease.unit.label}</span></td><td><Link className="registry-context" href={`/smlouvy/${lease.id}`}>{lease.contractNumber || "Bez čísla"}</Link></td><td>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</td><td>{money(lease.rentCents + lease.servicesCents)}</td><td>{leaseStatusAt(lease) === "ACTIVE" ? "Aktuální" : leaseStatusAt(lease) === "FUTURE" ? "Budoucí" : "Historie"}</td></tr>)}{!rows.length && <tr><td colSpan={6} className="muted-copy">Žádné smlouvy v tomto pohledu.</td></tr>}</tbody></table></div></div></Shell>;
}