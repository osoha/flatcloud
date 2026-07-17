import Link from "next/link";
import { Building2, Landmark, WalletCards } from "lucide-react";
import { requireUser, canSeeAll } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { money } from "@/lib/format";
import { currentPeriod } from "@/lib/period";
import { overdueDebtCents } from "@/lib/charges";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const [properties, query] = await Promise.all([accessibleProperties(user), searchParams]);
  const period = currentPeriod();
  const rows = properties.map((property) => {
    let expected = 0;
    let paid = 0;
    let debt = 0;
    for (const unit of property.units) for (const lease of unit.leases) for (const charge of lease.charges) {
      if (charge.period === period && charge.active) {
        expected += charge.amountCents;
        paid += charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
      }
      debt += overdueDebtCents(charge);
    }
    return { property, expected, paid, debt, rate: expected ? Math.round(paid / expected * 100) : 100 };
  });
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const debt = rows.reduce((sum, row) => sum + row.debt, 0);
  const ownerIds = new Set(rows.flatMap((row) => row.property.ownerships.length ? row.property.ownerships.map((ownership) => ownership.ownerId) : [row.property.ownerId]));

  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Portfolio nemovitostí</h1><p>Souhrn objektů dostupných přihlášenému uživateli · období {period}. Dluh zahrnuje pouze předpisy po splatnosti.</p></div>{canSeeAll(user.role) && <div className="action-row"><Link className="secondary" href="/vlastnici">Vlastníci a SPV</Link></div>}</div><Flash ok={query.ok} error={query.error}/><div className="stat-grid"><Kpi href="/reporty/nemovitosti" icon={<Building2/>} tone="blue" label="Nemovitosti" value={String(rows.length)} note="výkonnost portfolia"/><Kpi href="/reporty/vlastnici" icon={<Landmark/>} tone="purple" label="Vlastníci a SPV" value={String(ownerIds.size)} note="portfolio podle vlastníků"/><Kpi href="/reporty/predpisy" icon={<WalletCards/>} tone="orange" label={`Předpis ${period}`} value={money(expected)} note="vývoj předpisů"/><Kpi href="/reporty/inkaso" icon="✓" tone="green" label="Uhrazeno" value={money(paid)} note={`${expected ? Math.round(paid / expected * 100) : 100} % inkaso`}/><Kpi href="/reporty/saldo" icon="!" tone="red" label="Dluh po splatnosti" value={money(debt)} note="dlužníci a nejstarší splatnost" bad={debt > 0}/></div><div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Nemovitosti</h2><p>Kliknutím otevřete samostatný dashboard objektu.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost</th><th>Vlastník / SPV</th><th>Banka</th><th>Předpis</th><th>Dluh po splatnosti</th><th>Inkaso</th><th>Stav</th></tr></thead><tbody>{rows.length ? rows.map(({ property, expected: propertyExpected, debt: propertyDebt, rate }) => <tr className="property-row" key={property.id}><td><Link className="property-cell" href={`/nemovitosti/${property.id}/prehled`}><div className="property-thumb">⌂</div><div><strong>{property.name}</strong><small>{property.address}, {property.city}</small></div></Link></td><td><span className="owner-label">{property.ownerships.length ? property.ownerships.map((ownership) => ownership.owner.name).join(", ") : property.owner.name}</span><span className="owner-sub">{property.ownerships.length > 1 ? `${property.ownerships.length} vlastníci / spoluvlastníci` : property.owner.ico ? `IČO ${property.owner.ico}` : "Externí vlastník"}</span></td><td>{property.bankAccounts.find((account) => account.provider !== "manual")?.bankName || "Nepřipojeno"}<span className="owner-sub">{property.bankAccounts.find((account) => account.provider !== "manual")?.ibanMasked}</span></td><td className="money">{money(propertyExpected)}</td><td className={propertyDebt ? "money negative" : "money positive"}>{money(propertyDebt)}</td><td className="collection-cell"><div className="collection-top"><span>{rate}%</span></div><div className={`progress ${rate < 85 ? "bad" : rate < 95 ? "warn" : ""}`}><i style={{ width: `${Math.min(rate, 100)}%` }}/></div></td><td><span className={`status ${propertyDebt ? "bad" : rate >= 100 ? "ok" : "warn"}`}>{propertyDebt ? "Dluh" : rate >= 100 ? "Uhrazeno" : "Předepsáno"}</span></td></tr>) : <tr><td colSpan={7} className="table-empty"><h3>Zatím nejsou evidované nemovitosti</h3>{canSeeAll(user.role) && <Link className="primary inline-button" href="/nemovitosti/nova">Přidat první nemovitost</Link>}</td></tr>}</tbody></table></div></div></div></Shell>;
}

function Kpi({ href, icon, tone, label, value, note, bad = false }: { href: string; icon: React.ReactNode; tone: string; label: string; value: string; note: string; bad?: boolean }) {
  return <Link className="card stat stat-link" href={href}><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong className={bad ? "negative" : ""}>{value}</strong><small className={tone === "green" ? "good" : bad ? "bad" : ""}>{note}</small></div><b className="stat-arrow">→</b></Link>;
}
