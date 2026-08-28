import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date, money } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { isLeaseExpiring, leaseMatchesQuery, leaseMatchesView, type LeaseCatalogView } from "@/lib/lease-catalog";
import { securityDepositSnapshot } from "@/lib/security-deposit";

export const dynamic = "force-dynamic";
const views: Array<[LeaseCatalogView, string]> = [["ACTIVE", "Aktivní"], ["FUTURE", "Budoucí"], ["EXPIRING", "Expirující"], ["HISTORY", "Ukončené"], ["ALL", "Všechny"]];
const depositLabels = { NOT_CONFIGURED: "Neevidováno", UNPAID: "Nesloženo", PARTIAL: "Částečně", FUNDED: "Složeno", TO_SETTLE: "K vypořádání", SETTLED: "Vypořádáno" };

export default async function LeasesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; propertyId?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const view = views.some(([key]) => key === query.view) ? query.view as LeaseCatalogView : "ACTIVE";
  const [properties, leases] = await Promise.all([
    accessibleProperties(user),
    prisma.lease.findMany({ where: leaseAccessWhere(user), include: { tenant: true, unit: { include: { property: true } }, securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] }, securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] } }, orderBy: { startDate: "desc" } }),
  ]);
  const allowedPropertyIds = new Set(properties.map((property) => property.id));
  const propertyId = query.propertyId && allowedPropertyIds.has(query.propertyId) ? query.propertyId : "";
  const scoped = propertyId ? leases.filter((lease) => lease.unit.propertyId === propertyId) : leases;
  const counts = { ACTIVE: 0, FUTURE: 0, EXPIRING: 0, HISTORY: 0 };
  for (const lease of scoped) { const status = leaseStatusAt(lease); if (status === "ACTIVE") counts.ACTIVE++; else if (status === "FUTURE") counts.FUTURE++; else counts.HISTORY++; if (isLeaseExpiring(lease)) counts.EXPIRING++; }
  const rows = scoped.filter((lease) => leaseMatchesView(lease, view) && leaseMatchesQuery(lease, query.q || ""));
  const href = (nextView: string) => `/smlouvy?view=${nextView}${propertyId ? `&propertyId=${propertyId}` : ""}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`;
  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Smlouvy</span></div>
    <div className="page-title"><div><h1>Smlouvy</h1><p>Katalog nájemních vztahů v rozsahu vašich oprávnění.</p></div><div className="action-row"><Link className="secondary" href={`/smlouvy/upozorneni${propertyId ? `?propertyId=${propertyId}` : ""}`}>Expirace a výročí</Link><Link className="primary" href="/smlouvy/nova">Nová smlouva</Link></div></div>
    <div className="stat-grid lease-kpis">{([["ACTIVE", "Aktivní", counts.ACTIVE], ["FUTURE", "Budoucí", counts.FUTURE], ["EXPIRING", "Expirující do 3 měsíců", counts.EXPIRING], ["HISTORY", "Ukončené", counts.HISTORY]] as const).map(([key,label,count])=><Link className="card stat stat-link" href={href(key)} key={key}><div><span>{label}</span><strong>{count}</strong></div><b className="stat-arrow">→</b></Link>)}</div>
    <form className="card registry-filter-bar" action="/smlouvy"><input type="hidden" name="view" value={view}/><input name="q" defaultValue={query.q || ""} placeholder="Nájemník, e-mail, nemovitost, jednotka, smlouva nebo VS…"/><select name="propertyId" defaultValue={propertyId}><option value="">Všechny dostupné nemovitosti</option>{properties.map((property)=><option value={property.id} key={property.id}>{property.name}</option>)}</select><button className="secondary">Filtrovat</button></form>
    <nav className="registry-tabs">{views.map(([key,label])=><Link className={`registry-tab ${view === key ? "active" : ""}`} href={href(key)} key={key}>{label}</Link>)}<Link className="registry-tab" href={`/smlouvy/upozorneni${propertyId ? `?propertyId=${propertyId}` : ""}`}>Expirace a výročí</Link></nav>
    <div className="card table-wrap"><table className="registry-table"><thead><tr><th>Nájemník</th><th>Nemovitost / jednotka</th><th>Smlouva / VS</th><th>Platnost</th><th>Čisté nájemné</th><th>Služby</th><th>Kauce</th><th>Stav</th></tr></thead><tbody>{rows.map((lease) => { const detail = `/smlouvy/${lease.id}`; const deposit = securityDepositSnapshot(lease); const depositText = deposit.status === "PARTIAL" ? `${money(deposit.heldPrincipalCents)} / ${money(deposit.agreedAmountCents)} · ${depositLabels[deposit.status]}` : deposit.status === "FUNDED" || deposit.status === "UNPAID" ? `${money(deposit.agreedAmountCents)} · ${depositLabels[deposit.status]}` : deposit.status === "TO_SETTLE" ? `${depositLabels[deposit.status]} · ${money(deposit.heldPrincipalCents)}` : depositLabels[deposit.status]; return <tr className="clickable-table-row" key={lease.id}><td><Link className="row-cell-link" href={detail}><strong>{lease.tenant.name}</strong></Link></td><td><Link className="row-cell-link" href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unit.id}`}><span>{lease.unit.property.name}<small className="entity-secondary">{lease.unit.label}</small></span></Link></td><td><Link className="row-cell-link" href={detail}><span>{lease.contractNumber || "Bez čísla"}<small className="entity-secondary">VS {lease.variableSymbol || "—"}</small></span></Link></td><td><Link className="row-cell-link" href={detail}>{date(lease.startDate)} – {lease.endDate ? date(lease.endDate) : "neurčito"}</Link></td><td><Link className="row-cell-link" href={detail}>{money(lease.rentCents)}</Link></td><td><Link className="row-cell-link" href={detail}>{money(lease.servicesCents)}</Link></td><td><Link className="row-cell-link" href={`${detail}#kauce`}>{depositText}</Link></td><td><Link className="row-cell-link" href={detail}>{leaseStatusAt(lease) === "ACTIVE" ? "Aktivní" : leaseStatusAt(lease) === "FUTURE" ? "Budoucí" : "Ukončená"}</Link></td></tr>; })}{!rows.length && <tr><td colSpan={8} className="table-empty">Žádné smlouvy neodpovídají zvoleným filtrům.</td></tr>}</tbody></table></div>
  </div></Shell>;
}
