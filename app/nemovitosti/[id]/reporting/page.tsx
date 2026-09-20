import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { manualBaselineSnapshotDataSchema } from "@/lib/reporting/snapshot-schema";
import { resolvePropertyMfRentBenchmarks } from "@/lib/reporting/mf-rent/service";
import { currentLeaseForUnit, effectiveLeaseEnd } from "@/lib/lease-lifecycle-core";
import { rentRollAmountsAt } from "@/lib/reporting/rent-roll";
import { overdueDebtCents } from "@/lib/charges";
import { date, money } from "@/lib/format";

export const dynamic = "force-dynamic";

const czk = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });

export default async function PropertyReportingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unitId?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();

  const membership = property.memberships.find((row) => row.userId === user.id);
  const propertyWide = hasAllPropertyAccess(user) || Boolean(membership);
  const unitLimited = !propertyWide;
  const canWrite = hasAllPropertyAccess(user) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  const selectedUnit = query.unitId ? property.units.find((unit) => unit.id === query.unitId) : property.units.length === 1 ? property.units[0] : null;
  if (query.unitId && !selectedUnit) notFound();

  const snapshots = propertyWide
    ? await prisma.quarterSnapshot.findMany({
        where: { propertyId: id, source: "MANUAL_BASELINE" },
        include: { createdBy: { select: { name: true } } },
        orderBy: [{ year: "desc" }, { quarter: "desc" }, { revision: "desc" }],
      })
    : [];
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = `${row.year}-${row.quarter}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const historicalRows = [...latest.values()];

  const now = new Date();
  const mf = propertyWide
    ? await resolvePropertyMfRentBenchmarks({
        propertyId: id,
        targetYear: now.getUTCFullYear(),
        targetQuarter: Math.floor(now.getUTCMonth() / 3) + 1,
        cutoff: now,
      })
    : null;
  const mfMoney = (value: number | null | undefined) => value == null ? "—" : `${number.format(value / 100)} Kč/m²/měsíc`;

  const unitRows = property.units.map((unit) => {
    const activeLease = currentLeaseForUnit(unit.leases);
    const recurring = activeLease ? rentRollAmountsAt(activeLease, now) : null;
    const allCharges = unit.leases.flatMap((lease) => lease.charges);
    return {
      unit,
      activeLease,
      rentCents: recurring?.rent.amountCents ?? null,
      servicesCents: recurring?.services.amountCents ?? null,
      overdueDebtCents: allCharges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0),
      effectiveEnd: activeLease ? effectiveLeaseEnd(activeLease) : null,
    };
  });
  const selectedRow = selectedUnit ? unitRows.find((row) => row.unit.id === selectedUnit.id) : null;

  return <Shell user={user} taskPropertyId={id} taskLeaseId={selectedRow?.activeLease?.id}>
    <div className="page">
      <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/prehled`}>{property.name}</Link><span>›</span><span>Reporty</span></div>
      <div className="page-title">
        <div><PageHeading>{unitLimited ? "Reporty jednotek" : "Reporty"}</PageHeading><p>{property.name}{unitLimited ? " · pouze vaše jednotky" : ""}</p></div>
        {canWrite && <Link className="secondary" href={`/nemovitosti/${id}/nastaveni/reporting`}>Nastavení reportů</Link>}
      </div>
      <PropertySubnav propertyId={id} active="reporting" unitLimited={unitLimited}/>
      <Flash ok={query.ok} error={query.error}/>

      {selectedRow && <section className="card">
        <div className="card-head"><div><span className="eyebrow">Report jednotky</span><h2>{selectedRow.unit.label}</h2><p className="muted-copy">Aktuální provozní a finanční stav jednotky.</p></div><div className="mini-actions">{property.units.length > 1 && <Link className="secondary" href={`/nemovitosti/${id}/reporting`}>Všechny jednotky</Link>}<Link className="secondary" href={`/nemovitosti/${id}/jednotky/${selectedRow.unit.id}`}>Detail jednotky</Link></div></div>
        <div className="summary-list">
          <div><span>Obsazenost</span><strong>{selectedRow.activeLease ? "Obsazená" : "Volná"}</strong></div>
          <div><span>Nájemník</span><strong>{selectedRow.activeLease?.tenant.name || "—"}</strong></div>
          <div><span>Čisté nájemné / měsíc</span><strong>{selectedRow.rentCents == null ? "—" : money(selectedRow.rentCents)}</strong></div>
          <div><span>Služby / měsíc</span><strong>{selectedRow.servicesCents == null ? "—" : money(selectedRow.servicesCents)}</strong></div>
          <div><span>Dluh po splatnosti</span><strong className={selectedRow.overdueDebtCents ? "negative" : "positive"}>{money(selectedRow.overdueDebtCents)}</strong></div>
          <div><span>Konec aktivní smlouvy</span><strong>{selectedRow.effectiveEnd ? date(selectedRow.effectiveEnd) : selectedRow.activeLease ? "Doba neurčitá" : "—"}</strong></div>
        </div>
        {selectedRow.activeLease && <div className="mini-actions" style={{marginTop:16}}><Link className="secondary" href={`/smlouvy/${selectedRow.activeLease.id}`}>Smlouva</Link><Link className="secondary" href={`/smlouvy/${selectedRow.activeLease.id}/vyuctovani`}>Vyúčtování služeb</Link></div>}
      </section>}

      <section className="card">
        <div className="card-head"><div><h2>{unitLimited ? "Moje jednotky" : "Reporty jednotek"}</h2><p className="muted-copy">Reporty vedou na konkrétní jednotku a nikdy nerozšiřují přístup mimo přidělený rozsah.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Jednotka</th><th>Stav</th><th>Nájemník</th><th>Nájemné</th><th>Služby</th><th>Dluh po splatnosti</th><th></th></tr></thead><tbody>
          {unitRows.length ? unitRows.map((row) => <tr key={row.unit.id}><td><strong>{row.unit.label}</strong></td><td>{row.activeLease ? "Obsazená" : "Volná"}</td><td>{row.activeLease?.tenant.name || "—"}</td><td>{row.rentCents == null ? "—" : money(row.rentCents)}</td><td>{row.servicesCents == null ? "—" : money(row.servicesCents)}</td><td className={row.overdueDebtCents ? "negative" : "positive"}>{money(row.overdueDebtCents)}</td><td><Link href={`/nemovitosti/${id}/reporting?unitId=${row.unit.id}`}>Otevřít report</Link></td></tr>) : <tr><td colSpan={7} className="table-empty">V tomto rozsahu nejsou dostupné jednotky.</td></tr>}
        </tbody></table></div>
      </section>

      {propertyWide && <>
        <section className="card">
          <div className="card-head"><div><h2>Cenová mapa nájemného MF</h2><p className="muted-copy">Read-only benchmark objektu. Ruční přiřazení a korekce jsou v Nastavení reportů.</p></div>{canWrite && <Link className="secondary" href={`/nemovitosti/${id}/nastaveni/reporting#mf`}>Upravit přiřazení</Link>}</div>
          {mf?.mapping ? <div className="summary-list"><div><span>Katastrální území</span><strong>{mf.mapping.territoryName}</strong></div><div><span>Kód</span><strong>{mf.mapping.territoryCode}</strong></div><div><span>Zdroj přiřazení</span><strong>{mf.locationSource === "PROPERTY_CADASTRAL_DATA" ? "Údaje nemovitosti" : "Ruční korekce"}</strong></div><div><span>Datové období MF</span><strong>{mf.release ? `Q${mf.release.marketQuarter} ${mf.release.marketYear}` : "—"}</strong></div></div> : <p>{mf?.release ? "Nemovitost zatím není přiřazena ke katastrálnímu území MF." : "Pro toto období nejsou dostupná data MF."}</p>}
          {mf?.release && <div className="table-wrap"><table><thead><tr><th>Kategorie</th><th>Referenční nájem</th><th>Novostavba</th></tr></thead><tbody>{(["vk1","vk2","vk3","vk4"] as const).map((key)=><tr key={key}><td>{key.toUpperCase()}</td><td>{mfMoney(mf[key]?.referenceRentCentsPerM2)}</td><td>{mfMoney(mf[key]?.newBuildReferenceRentCentsPerM2)}</td></tr>)}</tbody></table></div>}
        </section>

        <section className="card">
          <div className="card-head"><div><h2>Historická kvartální data</h2><p className="muted-copy">Publikovaný read-only pohled. Nové revize se připravují pouze v Nastavení reportů.</p></div>{canWrite && <Link className="secondary" href={`/nemovitosti/${id}/nastaveni/reporting#historie`}>Spravovat historii</Link>}</div>
          <div className="table-wrap"><table><thead><tr><th>Období</th><th>Obsazenost</th><th>Čisté nájemné / měsíc</th><th>Čisté nájemné / m²</th><th>Inkaso</th><th>Dluh po splatnosti</th><th>Zdroj</th><th>Revize</th></tr></thead><tbody>
            {historicalRows.length ? historicalRows.map((row) => {
              const parsed = manualBaselineSnapshotDataSchema.safeParse(row.data);
              const data = parsed.success ? parsed.data : null;
              const occupancy = data?.schemaVersion === 2 && data.units?.occupancyBps !== undefined ? data.units.occupancyBps : typeof data?.units?.occupied === "number" && typeof data.units.rentable === "number" && data.units.rentable > 0 ? (data.units.occupied / data.units.rentable) * 10000 : null;
              return <tr key={row.id}><td>Q{row.quarter} {row.year}</td><td>{occupancy == null ? "—" : `${number.format(occupancy / 100)} %`}</td><td>{data?.rentRoll?.monthlyNetRentCents == null ? "—" : czk.format(data.rentRoll.monthlyNetRentCents / 100)}</td><td>{data?.rentRoll?.weightedNetRentPerM2Cents == null ? "—" : `${czk.format(data.rentRoll.weightedNetRentPerM2Cents / 100)}/m²`}</td><td>{data?.collections?.collectionRateBps == null ? "—" : `${number.format(data.collections.collectionRateBps / 100)} %`}</td><td>{data?.collections?.overdueDebtCents == null ? "—" : czk.format(data.collections.overdueDebtCents / 100)}</td><td>{row.sourceNote || "—"}</td><td>r{row.revision}</td></tr>;
            }) : <tr><td colSpan={8} className="table-empty">Zatím bez historických dat.</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </div>
  </Shell>;
}
