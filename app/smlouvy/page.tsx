import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseStatuses } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LeasesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const leases = await prisma.lease.findMany({ where: leaseAccessWhere(user), include: { tenant: true, unit: { include: { property: true } } }, orderBy: { startDate: "desc" } });
  const view = query.view || "ACTIVE";
  const rows = leases.filter((lease) => view === "ALL" || (view === "HISTORY" ? leaseStatusAt(lease) === "ENDED" : view === leaseStatusAt(lease)));
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Smlouvy</h1><p>Globální přehled nájemních vztahů v rozsahu vašich oprávnění.</p></div></div><div className="tabs"><Link className={view === "ACTIVE" ? "active" : ""} href="/smlouvy?view=ACTIVE">Aktuální</Link><Link className={view === "FUTURE" ? "active" : ""} href="/smlouvy?view=FUTURE">Budoucí</Link><Link className={view === "HISTORY" ? "active" : ""} href="/smlouvy?view=HISTORY">Historie</Link><Link href="/smlouvy/upozorneni">Upozornění</Link></div><div className="card table-wrap"><table><thead><tr><th>Nájemník</th><th>Nemovitost</th><th>Jednotka</th><th>Období</th><th>Stav</th></tr></thead><tbody>{rows.map((lease) => <tr key={lease.id}><td><Link href={`/najemnici/${lease.tenantId}`}><strong>{lease.tenant.name}</strong></Link></td><td>{lease.unit.property.name}</td><td>{lease.unit.label}</td><td>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</td><td><Link href={`/smlouvy/${lease.id}`}>{leaseStatuses[leaseStatusAt(lease)]}</Link></td></tr>)}{!rows.length && <tr><td colSpan={5} className="muted-copy">Žádné smlouvy v tomto pohledu.</td></tr>}</tbody></table></div></div></Shell>;
}
