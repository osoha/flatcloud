import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { date, money } from "@/lib/format";
import { effectiveLeaseEnd, leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { isLeaseExpiring, leaseMatchesQuery, leaseMatchesView, type LeaseCatalogView } from "@/lib/lease-catalog";
import { securityDepositSnapshot } from "@/lib/security-deposit";
import { contractingPartyNames } from "@/lib/lease-parties";
import { parsePortfolioSelection, portfolioSelectionLabel, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";

export const dynamic = "force-dynamic";
const views: Array<[LeaseCatalogView, string]> = [["ACTIVE", "Aktivní"], ["FUTURE", "Budoucí"], ["EXPIRING", "Expirující"], ["HISTORY", "Ukončené"], ["ALL", "Všechny"]];
const depositLabels = { NOT_CONFIGURED: "Neevidováno", UNPAID: "Nesloženo", PARTIAL: "Částečně", FUNDED: "Složeno", TO_SETTLE: "K vypořádání", SETTLED: "Vypořádáno" };

export default async function LeasesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; propertyId?: string; properties?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const view = views.some(([key]) => key === query.view) ? query.view as LeaseCatalogView : "ACTIVE";
  const properties = await accessibleProperties(user);
  const selection = query.properties === undefined ? { mode: "ALL" } as const : parsePortfolioSelection({ properties: query.properties });
  const selectedIds = selectedPropertyIds(selection, properties.map((property) => property.id));
  const allowedPropertyIds = new Set(selectedIds);
  const selectedProperties = properties.filter((property) => allowedPropertyIds.has(property.id));
  const leases = selectedIds.length ? await prisma.lease.findMany({ where: { AND: [leaseAccessWhere(user), { unit: { propertyId: { in: selectedIds } } }] }, include: { tenant: true, parties: { where: { role: "CONTRACTING_PARTY" }, include: { tenant: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, unit: { include: { property: true } }, securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] }, securityDepositMovements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] } }, orderBy: { startDate: "desc" } }) : [];
  const propertyId = query.propertyId && allowedPropertyIds.has(query.propertyId) ? query.propertyId : "";
  const scoped = propertyId ? leases.filter((lease) => lease.unit.propertyId === propertyId) : leases;
  const counts = { ACTIVE: 0, FUTURE: 0, EXPIRING: 0, HISTORY: 0 };
  for (const lease of scoped) { const status = leaseStatusAt(lease); if (status === "ACTIVE") counts.ACTIVE++; else if (status === "FUTURE") counts.FUTURE++; else counts.HISTORY++; if (isLeaseExpiring(lease)) counts.EXPIRING++; }
  const rows = scoped.filter((lease) => leaseMatchesView(lease, view) && leaseMatchesQuery(lease, query.q || ""));
  const selectionValue = serializePortfolioSelection(selection);
  const scopeSuffix = selectionValue === null ? "" : `&properties=${encodeURIComponent(selectionValue)}`;
  const href = (nextView: string) => `/smlouvy?view=${nextView}${scopeSuffix}${propertyId ? `&propertyId=${propertyId}` : ""}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`;
  const alertParams = new URLSearchParams({ ...(selectionValue === null ? {} : { properties: selectionValue }), ...(propertyId ? { propertyId } : {}) });
  const alertsHref = `/smlouvy/upozorneni${alertParams.size ? `?${alertParams}` : ""}`;
  const newLeaseHref = `/smlouvy/nova${selectionValue === null ? "" : `?properties=${encodeURIComponent(selectionValue)}`}`;
  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Smlouvy</span></div>
    <div className="page-title"><div><h1>Smlouvy</h1><p>{portfolioSelectionLabel(selection, selectedIds.length, properties.length)}.</p></div><div className="action-row"><Link className="secondary" href={alertsHref}>Expirace a výročí</Link><Link className="primary" href={newLeaseHref}>Nová smlouva</Link></div></div>
    <div className="stat-grid lease-kpis">{([["ACTIVE", "Aktivní", counts.ACTIVE], ["FUTURE", "Budoucí", counts.FUTURE], ["EXPIRING", "Expirující do 3 měsíců", counts.EXPIRING], ["HISTORY", "Ukončené", counts.HISTORY]] as const).map(([key,label,count])=><Link className="card stat stat-link" href={href(key)} key={key}><div><span>{label}</span><strong>{count}</strong></div><b className="stat-arrow">→</b></Link>)}</div>
    <form className="card registry-filter-bar" action="/smlouvy"><input type="hidden" name="view" value={view}/>{selectionValue !== null && <input type="hidden" name="properties" value={selectionValue}/>}<input name="q" aria-label="Hledat ve smlouvách" defaultValue={query.q || ""} placeholder="Nájemník, e-mail, nemovitost, jednotka, smlouva nebo VS…"/><select name="propertyId" aria-label="Filtrovat podle nemovitosti" defaultValue={propertyId}><option value="">Všechny objekty ve zvoleném rozsahu</option>{selectedProperties.map((property)=><option value={property.id} key={property.id}>{property.name}</option>)}</select><button className="secondary">Filtrovat</button></form>
    <nav className="registry-tabs" aria-label="Stav smluv">{views.map(([key,label])=><Link aria-current={view === key ? "page" : undefined} className={`registry-tab ${view === key ? "active" : ""}`} href={href(key)} key={key}>{label}</Link>)}<Link className="registry-tab" href={alertsHref}>Expirace a výročí</Link></nav>
    <div className="card table-wrap"><table className="registry-table"><thead><tr><th>Smluvní strany</th><th>Nemovitost / jednotka</th><th>Smlouva / VS</th><th>Platnost</th><th>Čisté nájemné</th><th>Služby</th><th>Kauce</th><th>Stav</th></tr></thead><tbody>{rows.map((lease) => { const detail = `/smlouvy/${lease.id}`; const deposit = securityDepositSnapshot(lease); const effectiveEnd = effectiveLeaseEnd(lease); const partyNames = contractingPartyNames(lease); const depositText = deposit.status === "PARTIAL" ? `${money(deposit.heldPrincipalCents)} / ${money(deposit.agreedAmountCents)} · ${depositLabels[deposit.status]}` : deposit.status === "FUNDED" || deposit.status === "UNPAID" ? `${money(deposit.agreedAmountCents)} · ${depositLabels[deposit.status]}` : deposit.status === "TO_SETTLE" ? `${depositLabels[deposit.status]} · ${money(deposit.heldPrincipalCents)}` : depositLabels[deposit.status]; return <tr className="clickable-table-row" key={lease.id}><td><Link className="row-cell-link" href={detail}><strong>{partyNames.join(" + ")}</strong></Link></td><td><Link className="row-cell-link" href={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unit.id}`}><span>{lease.unit.property.name}<small className="entity-secondary">{lease.unit.label}</small></span></Link></td><td><Link className="row-cell-link" href={detail}><span>{lease.contractNumber || "Bez čísla"}<small className="entity-secondary">VS {lease.variableSymbol || "—"}</small></span></Link></td><td><Link className="row-cell-link" href={detail}>{date(lease.startDate)} – {effectiveEnd ? date(effectiveEnd) : "neurčito"}</Link></td><td><Link className="row-cell-link" href={detail}>{money(lease.rentCents)}</Link></td><td><Link className="row-cell-link" href={detail}>{money(lease.servicesCents)}</Link></td><td><Link className="row-cell-link" href={`${detail}#kauce`}>{depositText}</Link></td><td><Link className="row-cell-link" href={detail}>{leaseStatusAt(lease) === "ACTIVE" ? "Aktivní" : leaseStatusAt(lease) === "FUTURE" ? "Budoucí" : "Ukončená"}</Link></td></tr>; })}{!rows.length && <tr><td colSpan={8} className="table-empty">Žádné smlouvy neodpovídají zvoleným filtrům.</td></tr>}</tbody></table></div>
  </div></Shell>;
}
