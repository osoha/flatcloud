import { isFlatcloudMember } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasAllPropertyAccess, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { manualBaselineSnapshotDataSchema } from "@/lib/reporting/snapshot-schema";
import { resolvePropertyMfRentBenchmarks } from "@/lib/reporting/mf-rent/service";
import { searchMfRentTerritories } from "@/lib/reporting/mf-rent/location-service";
import { date, money } from "@/lib/format";
import { loadPropertySaleBenchmark, saleBenchmarkConfidenceLabels, saleBenchmarkMetrics, saleBenchmarkSources } from "@/lib/reporting/sale-benchmark";

export const dynamic = "force-dynamic";

function inputMoney(value: number | null | undefined) { return value == null ? "" : String(value / 100).replace(".", ","); }
function inputPercent(value: number | null | undefined) { return value == null ? "" : String(value / 100).replace(".", ","); }

export default async function ReportingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; mfSearch?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const canWrite = hasAllPropertyAccess(user) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  if (!canWrite) notFound();

  const corporateHistory=isFlatcloudMember(user)&&(property.flatcloudConsolidationBasisPoints??0)>0;
  const snapshots = corporateHistory ? await prisma.quarterSnapshot.findMany({
    where: { propertyId: id, source: "MANUAL_BASELINE" },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ year: "desc" }, { quarter: "desc" }, { revision: "desc" }],
  }) : [];
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = `${row.year}-${row.quarter}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const rows = [...latest.values()];
  const editing = query.edit ? latest.get(query.edit) : undefined;
  const editData = editing ? manualBaselineSnapshotDataSchema.safeParse(editing.data) : null;
  const d = editData?.success ? editData.data : null;
  const explicit = d?.source === "MANUAL_BASELINE" && d.schemaVersion === 2 ? d.units?.occupancyBps : undefined;
  const derived = explicit ?? (typeof d?.units?.occupied === "number" && typeof d.units.rentable === "number" && d.units.rentable > 0 ? Math.round((d.units.occupied / d.units.rentable) * 10000) : undefined);

  const now = new Date();
  const mf = await resolvePropertyMfRentBenchmarks({ propertyId: id, targetYear: now.getUTCFullYear(), targetQuarter: Math.floor(now.getUTCMonth() / 3) + 1, cutoff: now });
  const mfCandidates = query.mfSearch ? await searchMfRentTerritories(query.mfSearch, property.city, 25) : [];
  const sale = await loadPropertySaleBenchmark(id);

  return <Shell user={user} taskPropertyId={id}>
    <div className="page">
      <div className="breadcrumb"><Link href={`/nemovitosti/${id}/prehled`}>{property.name}</Link><span>›</span><Link href={`/nemovitosti/${id}/nastaveni`}>Nastavení</Link><span>›</span><span>Reporty</span></div>
      <div className="page-title"><div><PageHeading>Nastavení reportů</PageHeading><p>{property.name} · korekce a historické vstupy</p></div><Link className="secondary" href={`/nemovitosti/${id}/reporting`}>Zpět na reporty</Link></div>
      <PropertySubnav propertyId={id} active="nastaveni"/>
      <Flash ok={query.ok} error={query.error}/>


      <section id="mf" className="card">
        <div className="card-head"><div><h2>Přiřazení cenové mapy MF</h2><p className="muted-copy">Ruční korekci používejte jen tehdy, když automatické přiřazení podle údajů nemovitosti není jednoznačné.</p></div></div>
        <div className="summary-list"><div><span>Aktuální území</span><strong>{mf.mapping ? `${mf.mapping.territoryName} · ${mf.mapping.territoryCode}` : "Nepřiřazeno"}</strong></div><div><span>Zdroj</span><strong>{mf.mapping ? mf.locationSource === "PROPERTY_CADASTRAL_DATA" ? "Údaje nemovitosti" : "Ruční korekce" : "—"}</strong></div><div><span>Datové období</span><strong>{mf.release ? `Q${mf.release.marketQuarter} ${mf.release.marketYear}` : "Nedostupné"}</strong></div></div>
        {mf.cadastralArea && !mf.mapping && <p className="muted-copy">Katastrální území „{mf.cadastralArea}“ z údajů nemovitosti nebylo možné jednoznačně spojit s aktuálními daty MF.</p>}
        <form method="get" className="compact-form">
          <label className="field"><span>Hledat území, obec nebo kód</span><input name="mfSearch" defaultValue={query.mfSearch || ""} placeholder="např. Černice, Plzeň Černice nebo 620106"/></label>
          <button className="secondary" type="submit">Vyhledat</button>
        </form>
        {mfCandidates.length > 0 && <div className="stack-list">{mfCandidates.map((candidate) => <form key={candidate.territoryCode} action={`/api/properties/${id}/mf-rent/location`} method="post" className="inline-edit-card"><input type="hidden" name="territoryCode" value={candidate.territoryCode}/><div className="rule-summary"><div><strong>{candidate.territoryName}</strong><small>{candidate.municipalityName} · {candidate.territoryCode}</small></div><button className="secondary" type="submit">Přiřadit</button></div></form>)}</div>}
      </section>

      <section id="prodejni-benchmark" className="card portfolio-table-card">
        <div className="card-head"><div><h2>Orientační prodejní benchmark</h2><p className="muted-copy">Stejné katastrální přiřazení jako MF, samostatné řady realizovaných a nabídkových cen. Automatický benchmark nikdy sám nepřepisuje valuaci.</p></div>{user.role==="SUPER_ADMIN"&&<Link className="secondary" href="/nastaveni/cenovy-benchmark">Správa dat</Link>}</div>
        {!sale?.territoryCode?<div className="notice"><strong>Chybí územní přiřazení</strong><span>Nejprve potvrďte katastrální území v cenové mapě MF výše.</span></div>:!sale.realized&&!sale.offer?<div className="notice"><strong>Pro {sale.territoryName||sale.territoryCode} zatím nejsou data</strong><span>Chybějící benchmark není nula. Super-admin může načíst auditovaný kvartální snapshot.</span></div>:<>
          <div className="stat-grid v21-stat-grid"><div className="card stat"><div><span>Realizované ceny</span><strong>{sale.realized?`${money(Number(sale.realized.pricePerSqmCents))}/m²`:"—"}</strong><small>{sale.realized?`${sale.realized.marketYear} Q${sale.realized.marketQuarter} · ${sale.realized.sampleCount} transakcí · ${saleBenchmarkConfidenceLabels[sale.realized.confidence]}`:"Nedostatek dat"}</small></div></div><div className="card stat"><div><span>Nabídkový puls</span><strong>{sale.offer?`${money(Number(sale.offer.pricePerSqmCents))}/m²`:"—"}</strong><small>{sale.offer?`${sale.offer.marketYear} Q${sale.offer.marketQuarter} · ${sale.offer.sampleCount} nabídek · ${saleBenchmarkConfidenceLabels[sale.offer.confidence]}`:"Nedostatek dat"}</small></div></div><div className="card stat"><div><span>Orientační hodnota bytů</span><strong>{sale.benchmarkValueCents==null?"—":money(sale.benchmarkValueCents)}</strong><small>pokrytí {sale.coveredUnits}/{sale.totalUnits} aktivních bytů</small></div></div><div className="card stat"><div><span>Mezikvartální trend</span><strong>{sale.qoqBps==null?"—":`${sale.qoqBps>=0?"+":""}${(sale.qoqBps/100).toLocaleString("cs-CZ",{maximumFractionDigits:2})} %`}</strong><small>realizovaná řada, bez prognózy</small></div></div></div>
          {sale.realized&&<><div className="table-toolbar"><div><h3>Jednotky podle benchmarku</h3><p>Relevantní plocha × realizovaný benchmark. Potvrzení vytvoří nový stav historie; původní valuaci nemaže.</p></div></div><div className="table-wrap"><table><thead><tr><th>Jednotka</th><th>Plocha</th><th>Orientační hodnota</th><th>Podklad</th><th></th></tr></thead><tbody>{sale.unitRows.map(unit=><tr key={unit.id}><td><strong>{unit.label}</strong></td><td>{unit.areaM2?`${unit.areaM2.toLocaleString("cs-CZ")} m²`:"—"}</td><td>{unit.benchmarkValueCents==null?"—":money(unit.benchmarkValueCents)}</td><td>{saleBenchmarkSources[sale.realized!.source]}<span className="owner-sub">{saleBenchmarkMetrics[sale.realized!.metric]} · okno {date(sale.realized!.windowFrom)}–{date(sale.realized!.windowTo)}</span></td><td>{corporateHistory&&canSeeAll(user.role)&&unit.benchmarkValueCents?<form action={`/api/properties/${id}/sale-benchmark/accept-unit`} method="post"><input type="hidden" name="unitId" value={unit.id}/><input type="hidden" name="snapshotId" value={sale.realized!.id}/><label className="checkbox-field"><input name="confirm" type="checkbox" required/><span>Potvrdit</span></label><button className="secondary" type="submit">Uložit valuaci</button></form>:"—"}</td></tr>)}</tbody></table></div></>}
          {sale.trend.length>0&&<div className="benchmark-trend-list"><h3>Historie realizovaného benchmarku</h3><div className="summary-list">{sale.trend.map(point=><div key={`${point.year}-${point.quarter}`}><span>{point.year} Q{point.quarter} · {point.sampleCount} vzorků</span><strong>{money(point.pricePerSqmCents)}/m²</strong></div>)}</div></div>}
        </>}
      </section>

      {corporateHistory && <section id="historie" className="card">
        <div className="card-head"><div><h2>Historická kvartální data</h2><p className="muted-copy">Každé uložení vytváří novou neměnnou revizi. Prázdné hodnoty zůstávají neznámé.</p></div></div>
        <form className="compact-form" action={`/api/properties/${id}/reporting/historical-quarter`} method="post">
          <label className="field"><span>Rok</span><input name="year" type="number" min="1900" max="2200" required defaultValue={editing?.year}/></label>
          <label className="field"><span>Čtvrtletí</span><select name="quarter" required defaultValue={editing?.quarter || 1}>{[1,2,3,4].map((q)=><option key={q} value={q}>Q{q}</option>)}</select></label>
          <label className="field"><span>Obsazenost (%)</span><input name="occupancyPercent" inputMode="decimal" defaultValue={inputPercent(derived)}/></label>
          <label className="field"><span>Měsíční čisté nájemné (Kč)</span><input name="monthlyNetRentCzk" inputMode="decimal" defaultValue={inputMoney(d?.rentRoll?.monthlyNetRentCents)}/></label>
          <label className="field"><span>Čisté nájemné / m² / měsíc (Kč)</span><input name="weightedNetRentPerM2Czk" inputMode="decimal" defaultValue={inputMoney(d?.rentRoll?.weightedNetRentPerM2Cents)}/></label>
          <label className="field"><span>Úspěšnost inkasa (%)</span><input name="collectionRatePercent" inputMode="decimal" defaultValue={inputPercent(d?.collections?.collectionRateBps)}/></label>
          <label className="field"><span>Dluh po splatnosti (Kč)</span><input name="overdueDebtCzk" inputMode="decimal" defaultValue={inputMoney(d?.collections?.overdueDebtCents)}/></label>
          <label className="field field-full"><span>Zdroj / poznámka</span><input name="sourceNote" maxLength={500} required defaultValue={editing?.sourceNote || ""}/></label>
          <button className="primary" type="submit">{editing ? "Uložit novou revizi" : "Uložit období"}</button>
        </form>
        <div className="table-wrap" style={{marginTop:16}}><table><thead><tr><th>Období</th><th>Revize</th><th>Zdroj</th><th>Uložil / datum</th><th></th></tr></thead><tbody>{rows.length ? rows.map((row)=><tr key={row.id}><td>Q{row.quarter} {row.year}</td><td>r{row.revision}</td><td>{row.sourceNote || "—"}</td><td>{row.createdBy?.name || "—"} · {row.createdAt.toLocaleDateString("cs-CZ")}</td><td><Link href={`/nemovitosti/${id}/nastaveni/reporting?edit=${row.year}-${row.quarter}#historie`}>Nová revize</Link></td></tr>) : <tr><td colSpan={5} className="table-empty">Zatím bez historických dat.</td></tr>}</tbody></table></div>
      </section>}
    </div>
  </Shell>;
}
