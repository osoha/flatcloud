import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, TrendingUp, WalletCards } from "lucide-react";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { accessibleProperties } from "@/lib/access";
import { money, date } from "@/lib/format";
import { currentPeriod } from "@/lib/period";
import { leaseStatuses } from "@/lib/labels";
import { Shell } from "@/components/Shell";
import { CollectionChart } from "@/components/ReportChart";

export const dynamic = "force-dynamic";

const reportTitles = {
  nemovitosti: ["Výkonnost nemovitostí", "Souhrn jednotek, obsazenosti, předpisů a inkasa v dostupném portfoliu."],
  vlastnici: ["Portfolio podle vlastníků", "Objekty, jednotky a aktuální finanční výkon seskupené podle vlastníka / SPV."],
  predpisy: ["Report předpisů", "Vývoj měsíčních předpisů a jejich úhrad za posledních 12 měsíců."],
  inkaso: ["Report inkasa", "Úspěšnost inkasa podle nemovitostí a vývoj uhrazených částek."],
  saldo: ["Saldo a dlužníci", "Otevřené pohledávky podle nájemních vztahů včetně ukončených smluv."],
} as const;

type ReportKey = keyof typeof reportTitles;

function recentPeriods(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<{ propertyId?: string }> }) {
  const [{ report }, query] = await Promise.all([params, searchParams]);
  if (!(report in reportTitles)) notFound();
  const reportKey = report as ReportKey;
  const user = await requireUser();
  const allProperties = await accessibleProperties(user);
  const propertyScope = query.propertyId ? allProperties.find((property) => property.id === query.propertyId) : undefined;
  if (query.propertyId && !propertyScope) notFound();
  const properties = propertyScope ? [propertyScope] : allProperties;
  const period = currentPeriod();
  const periods = recentPeriods();
  const charges = properties.flatMap((property) => property.units.flatMap((unit) => unit.leases.flatMap((lease) => lease.charges.filter((charge) => charge.active).map((charge) => ({ property, unit, lease, charge, paid: charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) })))));
  const trend = periods.map((item) => {
    const rows = charges.filter((row) => row.charge.period === item);
    return { label: item, expected: rows.reduce((sum, row) => sum + row.charge.amountCents, 0), paid: rows.reduce((sum, row) => sum + row.paid, 0) };
  });
  const currentRows = charges.filter((row) => row.charge.period === period);
  const expected = currentRows.reduce((sum, row) => sum + row.charge.amountCents, 0);
  const paid = currentRows.reduce((sum, row) => sum + row.paid, 0);
  const debtRows = charges.filter((row) => row.paid < row.charge.amountCents);
  const debtTotal = debtRows.reduce((sum, row) => sum + row.charge.amountCents - row.paid, 0);
  const [baseTitle, baseDescription] = reportTitles[reportKey];
  const title = propertyScope ? `${baseTitle} – ${propertyScope.name}` : baseTitle;
  const description = propertyScope ? `${baseDescription} Report je omezen pouze na tento objekt.` : baseDescription;
  const backHref = propertyScope ? `/nemovitosti/${propertyScope.id}/prehled` : "/portfolio";
  const backLabel = propertyScope ? "Zpět na objekt" : "Zpět na portfolio";

  const propertyRows = properties.map((property) => {
    const rows = currentRows.filter((row) => row.property.id === property.id);
    const propertyExpected = rows.reduce((sum, row) => sum + row.charge.amountCents, 0);
    const propertyPaid = rows.reduce((sum, row) => sum + row.paid, 0);
    return { property, expected: propertyExpected, paid: propertyPaid, rate: propertyExpected ? Math.round(propertyPaid / propertyExpected * 100) : 100, activeLeases: property.units.flatMap((unit) => unit.leases).filter((lease) => lease.status === "ACTIVE").length };
  });

  const debtorMap = new Map<string, { propertyId: string; propertyName: string; unitId: string; unitLabel: string; leaseId: string; tenantName: string; tenantActive: boolean; leaseStatus: string; total: number; paid: number; debt: number; oldestDue: Date; count: number }>();
  for (const row of debtRows) {
    const existing = debtorMap.get(row.lease.id);
    const debt = row.charge.amountCents - row.paid;
    if (existing) {
      existing.total += row.charge.amountCents;
      existing.paid += row.paid;
      existing.debt += debt;
      existing.count += 1;
      if (row.charge.dueDate < existing.oldestDue) existing.oldestDue = row.charge.dueDate;
    } else debtorMap.set(row.lease.id, { propertyId: row.property.id, propertyName: row.property.name, unitId: row.unit.id, unitLabel: row.unit.label, leaseId: row.lease.id, tenantName: row.lease.tenant.name, tenantActive: row.lease.tenant.active, leaseStatus: row.lease.status, total: row.charge.amountCents, paid: row.paid, debt, oldestDue: row.charge.dueDate, count: 1 });
  }
  const debtors = Array.from(debtorMap.values()).sort((a, b) => b.debt - a.debt);

  const ownerMap = new Map<string, { id: string; name: string; properties: Set<string>; units: number; expected: number; paid: number }>();
  for (const row of propertyRows) {
    const ownerships = row.property.ownerships.length ? row.property.ownerships : [{ ownerId: row.property.ownerId, owner: row.property.owner, shareBasisPoints: 10000 }];
    for (const ownership of ownerships) {
      const current = ownerMap.get(ownership.ownerId) || { id: ownership.ownerId, name: ownership.owner.name, properties: new Set<string>(), units: 0, expected: 0, paid: 0 };
      const share = Math.max(0, ownership.shareBasisPoints) / 10000;
      current.properties.add(row.property.id);
      current.units += row.property.units.length;
      current.expected += Math.round(row.expected * share);
      current.paid += Math.round(row.paid * share);
      ownerMap.set(current.id, current);
    }
  }
  const owners = Array.from(ownerMap.values()).sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/portfolio">Portfolio</Link>{propertyScope&&<><span>›</span><Link href={`/nemovitosti/${propertyScope.id}/prehled`}>{propertyScope.name}</Link></>}<span>›</span><span>Reporty</span><span>›</span><span>{baseTitle}</span></div><div className="page-title report-title"><div><h1>{title}</h1><p>{description}</p></div><Link className="secondary" href={backHref}>{backLabel}</Link></div><div className="stat-grid report-stat-grid"><div className="card stat"><div className="stat-icon blue"><Building2/></div><div><span>{propertyScope ? "Jednotky" : "Nemovitosti"}</span><strong>{propertyScope ? propertyScope.units.length : properties.length}</strong><small>{propertyScope ? `${propertyScope.units.flatMap((unit) => unit.leases).filter((lease) => lease.status === "ACTIVE").length} aktivních smluv` : "v rozsahu uživatele"}</small></div></div><div className="card stat"><div className="stat-icon orange"><WalletCards/></div><div><span>Předpis {period}</span><strong>{money(expected)}</strong><small>{currentRows.length} předpisů</small></div></div><div className="card stat"><div className="stat-icon green"><TrendingUp/></div><div><span>Uhrazeno</span><strong>{money(paid)}</strong><small className="good">{expected ? Math.round(paid / expected * 100) : 100} % inkaso</small></div></div><div className="card stat"><div className="stat-icon red">!</div><div><span>Otevřené saldo</span><strong className="negative">{money(debtTotal)}</strong><small className="bad">{debtors.length} dlužníků</small></div></div></div><div className="card report-chart-card"><div className="card-head"><div><h2>Vývoj za posledních 12 měsíců</h2><p className="muted-copy">Předpis a skutečně alokované úhrady podle období.</p></div></div><CollectionChart data={trend}/></div>

  {reportKey === "saldo" && <ReportTable headers={["Nájemník", "Nemovitost / jednotka", "Stav vztahu", "Otevřené předpisy", "Nejstarší splatnost", "Dluh", ""]} rows={debtors.map((row) => [<strong key="tenant">{row.tenantName}<span className="owner-sub">{row.tenantActive ? "Aktivní nájemník" : "Neaktivní nájemník"}</span></strong>, <span key="unit">{row.propertyName}<span className="owner-sub">{row.unitLabel}</span></span>, <span className={`status ${row.leaseStatus === "ACTIVE" ? "ok" : row.leaseStatus === "FUTURE" ? "warn" : ""}`} key="status">{leaseStatuses[row.leaseStatus as keyof typeof leaseStatuses]}</span>, row.count, date(row.oldestDue), <strong className="negative" key="debt">{money(row.debt)}</strong>, <Link className="table-link" key="link" href={`/nemovitosti/${row.propertyId}/jednotky/${row.unitId}`}>Otevřít jednotku</Link>])}/>} 
  {reportKey === "nemovitosti" && <ReportTable headers={["Nemovitost", "Jednotky", "Aktivní smlouvy", "Předpis", "Uhrazeno", "Saldo", "Inkaso"]} rows={propertyRows.map((row) => [<Link className="entity-link" key="property" href={`/nemovitosti/${row.property.id}/prehled`}>{row.property.name}<span className="owner-sub">{row.property.address}, {row.property.city}</span></Link>, row.property.units.length, row.activeLeases, money(row.expected), money(row.paid), <strong className={row.paid-row.expected<0?"negative":"positive"} key="balance">{money(row.paid-row.expected)}</strong>, `${row.rate} %`])}/>} 
  {reportKey === "inkaso" && <ReportTable headers={["Nemovitost", "Předpis", "Uhrazeno", "Chybí uhradit", "Inkaso", ""]} rows={propertyRows.sort((a,b)=>a.rate-b.rate).map((row) => [row.property.name, money(row.expected), money(row.paid), <strong className="negative" key="missing">{money(Math.max(0,row.expected-row.paid))}</strong>, <div className={`progress ${row.rate<85?"bad":row.rate<95?"warn":""}`} key="progress"><i style={{width:`${Math.min(row.rate,100)}%`}}/></div>, <Link className="table-link" key="link" href={`/nemovitosti/${row.property.id}/dluznici`}>Detail salda</Link>])}/>} 
  {reportKey === "predpisy" && <ReportTable headers={["Období", "Předpis", "Uhrazeno", "Saldo", "Inkaso"]} rows={[...trend].reverse().map((row) => [row.label, money(row.expected), money(row.paid), <strong className={row.paid-row.expected<0?"negative":"positive"} key="balance">{money(row.paid-row.expected)}</strong>, `${row.expected?Math.round(row.paid/row.expected*100):100} %`])}/>} 
  {reportKey === "vlastnici" && <ReportTable headers={["Vlastník / SPV", "Nemovitosti", "Jednotky", "Předpis", "Uhrazeno", "Saldo"]} rows={owners.map((row) => [hasAllPropertyAccess(user)?<Link className="entity-link" key="owner" href={`/vlastnici/${row.id}`}>{row.name}</Link>:<strong key="owner">{row.name}</strong>, row.properties.size, row.units, money(row.expected), money(row.paid), <strong className={row.paid-row.expected<0?"negative":"positive"} key="balance">{money(row.paid-row.expected)}</strong>])}/>} 
  </div></Shell>;
}

function ReportTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div className="card portfolio-table-card report-table-card"><div className="table-toolbar"><div><h2>Detail reportu</h2><p>Klikací záznamy vedou přímo na související objekt nebo jednotku.</p></div></div><div className="table-wrap"><table><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>):<tr><td className="table-empty" colSpan={headers.length}>Bez záznamů</td></tr>}</tbody></table></div></div>;
}
