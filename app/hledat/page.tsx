import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, leaseAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const q = (query.q || "").trim();
  const needle = q.toLocaleLowerCase("cs-CZ");
  const properties = await accessibleProperties(user);
  const propertyIds = properties.map((property) => property.id);

  const propertyResults = needle ? properties.filter((property) =>
    [property.name, property.address, property.city, property.postalCode || ""].some((value) => value.toLocaleLowerCase("cs-CZ").includes(needle)),
  ).slice(0, 12) : [];

  const unitResults = needle ? properties.flatMap((property) => property.units
    .filter((unit) => unit.label.toLocaleLowerCase("cs-CZ").includes(needle))
    .map((unit) => ({ property, unit }))).slice(0, 15) : [];

  const tenantMap = new Map<string, { propertyId: string; propertyName: string; unitLabel: string; tenant: { id: string; name: string; email: string | null; phone: string | null } }>();
  if (needle) {
    for (const property of properties) for (const unit of property.units) for (const lease of unit.leases) {
      const tenant = lease.tenant;
      if (![tenant.name, tenant.email || "", tenant.phone || ""].some((value) => value.toLocaleLowerCase("cs-CZ").includes(needle))) continue;
      if (!tenantMap.has(tenant.id)) tenantMap.set(tenant.id, { propertyId: property.id, propertyName: property.name, unitLabel: unit.label, tenant });
    }
  }
  const tenantResults = Array.from(tenantMap.values()).slice(0, 15);

  const [tasks, transactions, leases] = q ? await Promise.all([
    prisma.task.findMany({
      where: { propertyId: { in: propertyIds }, OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
      include: { property: true }, orderBy: { updatedAt: "desc" }, take: 15,
    }),
    prisma.bankTransaction.findMany({
      where: { bankAccount: { propertyId: { in: propertyIds } }, OR: [
        { variableSymbol: { contains: q, mode: "insensitive" } },
        { counterpartyName: { contains: q, mode: "insensitive" } },
        { counterpartyIban: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
      ] },
      include: { bankAccount: { include: { property: true } } }, orderBy: { bookedAt: "desc" }, take: 15,
    }),
    prisma.lease.findMany({ where: { ...leaseAccessWhere(user), OR: [{ contractNumber: { contains: q, mode: "insensitive" } }, { variableSymbol: { contains: q, mode: "insensitive" } }, { tenant: { name: { contains: q, mode: "insensitive" } } }, { unit: { label: { contains: q, mode: "insensitive" } } }, { unit: { property: { name: { contains: q, mode: "insensitive" } } } }] }, include: { tenant: true, unit: { include: { property: true } } }, orderBy: { startDate: "desc" }, take: 15 }),
  ]) : [[], [], []];

  const count = propertyResults.length + unitResults.length + tenantResults.length + tasks.length + transactions.length + leases.length;

  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Hledání</span></div>
    <div className="page-title"><div><h1>Hledání</h1><p>Nemovitosti, jednotky, nájemníci, smlouvy, platby a úkoly v rozsahu vašich oprávnění.</p></div></div>
    <form className="card search-page-form" action="/hledat" method="get">
      <Search size={18}/><input name="q" defaultValue={q} autoFocus placeholder="Hledat nemovitost, nájemníka, smlouvu, VS, platbu nebo úkol…"/><button className="primary" type="submit">Hledat</button>
    </form>
    {!q ? <div className="card empty-state"><h2>Začněte zadáním hledaného výrazu</h2><p>Můžete hledat například název domu, číslo jednotky, jméno nájemníka, variabilní symbol nebo název úkolu.</p></div> : <>
      <div className="search-summary">Nalezeno <strong>{count}</strong> výsledků pro „{q}“</div>
      <div className="search-grid">
        <SearchCard title="Nemovitosti" empty="Žádná nemovitost neodpovídá hledání.">{propertyResults.map((property) => <Link className="search-hit" href={`/nemovitosti/${property.id}/prehled`} key={property.id}><strong>{property.name}</strong><span>{property.address}, {property.city}</span></Link>)}</SearchCard>
        <SearchCard title="Jednotky" empty="Žádná jednotka neodpovídá hledání.">{unitResults.map(({ property, unit }) => <Link className="search-hit" href={`/nemovitosti/${property.id}/jednotky/${unit.id}`} key={unit.id}><strong>{unit.label}</strong><span>{property.name}</span></Link>)}</SearchCard>
        <SearchCard title="Nájemníci" empty="Žádný nájemník neodpovídá hledání.">{tenantResults.map((row) => <Link className="search-hit" href={`/najemnici/${row.tenant.id}`} key={row.tenant.id}><strong>{row.tenant.name}</strong><span>{row.propertyName} · {row.unitLabel}</span></Link>)}</SearchCard>
        <SearchCard title="Smlouvy" empty="Žádná smlouva neodpovídá hledání.">{leases.map((lease) => <Link className="search-hit" href={`/smlouvy/${lease.id}`} key={lease.id}><strong>{lease.contractNumber || "Bez čísla"}</strong><span>{lease.tenant.name} · {lease.unit.property.name} / {lease.unit.label} · VS {lease.variableSymbol || "—"}</span></Link>)}</SearchCard>
        <SearchCard title="Úkoly" empty="Žádný úkol neodpovídá hledání.">{tasks.map((task) => <Link className="search-hit" href={`/ukoly/${task.id}`} key={task.id}><strong>{task.title}</strong><span>{task.property.name} · {task.status}</span></Link>)}</SearchCard>
        <SearchCard title="Platby" empty="Žádná platba neodpovídá hledání.">{transactions.map((tx) => <Link className="search-hit" href={`/nemovitosti/${tx.bankAccount.propertyId}/platby/${tx.id}`} key={tx.id}><strong>{money(tx.amountCents)} · VS {tx.variableSymbol || "—"}</strong><span>{tx.bankAccount.property.name} · {date(tx.bookedAt)} · {tx.counterpartyName || "Neznámý plátce"}</span></Link>)}</SearchCard>
      </div>
    </>}
  </div></Shell>;
}

function SearchCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="card search-card"><h2>{title}</h2><div className="search-hit-list">{hasChildren ? children : <p className="muted-copy">{empty}</p>}</div></div>;
}
