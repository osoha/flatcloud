import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ClipboardCheck, Handshake, Home, Users } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { DismissibleDetails } from "@/components/DismissibleDetails";
import { canSeeAll, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { currentLeaseForUnit } from "@/lib/lease-lifecycle-core";
import { unitValuationSources } from "@/lib/distribution/unit-valuations";

export const dynamic = "force-dynamic";

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; properties?: string }> }) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const requestedPropertyIds = query.properties === undefined ? null : [...new Set(query.properties.split(",").map((id) => id.trim()).filter(Boolean))];
  const returnTo = requestedPropertyIds ? `/distribuce?properties=${encodeURIComponent(requestedPropertyIds.join(","))}` : "/distribuce";
  const properties = await prisma.property.findMany({
    where: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 }, ...(requestedPropertyIds ? { id: { in: requestedPropertyIds } } : {}) },
    select: { id: true, name: true, address: true, units: { select: {
      id: true, label: true, areaM2: true, status: true,
      leases: { select: { startDate: true, endDate: true, terminatedOn: true, cancelledAt: true, tenant: { select: { name: true } } } },
      conditionAssessments: { orderBy: [{ assessedAt: "desc" }, { createdAt: "desc" }], take: 1 },
      assetAssessments: { orderBy: [{ assessedAt: "desc" }, { createdAt: "desc" }], take: 2, include: { createdBy: { select: { name: true } } } },
      valuationSnapshots: { orderBy: [{ valuationDate: "desc" }, { createdAt: "desc" }], take: 2, include: { createdBy: { select: { name: true } } } },
      distributionOpportunities: { select: { id: true, stage: true } },
    }, orderBy: { label: "asc" } } },
    orderBy: { name: "asc" },
  });
  const units = properties.flatMap((property) => property.units.map((unit) => ({ property, ...unit })));
  const readiness = units.map((unit) => unit.assetAssessments[0]).filter(Boolean);
  const conditions = units.map((unit) => unit.conditionAssessments[0]).filter(Boolean);
  const valuations = units.map((unit) => unit.valuationSnapshots[0]).filter(Boolean);
  const marketValue = valuations.reduce((sum, row) => sum + Number(row.marketValueCents), 0);
  const ready = readiness.filter((row) => row.distributionReady).length;
  const openOpportunities = units.flatMap((unit) => unit.distributionOpportunities).filter((item) => !["WON", "LOST"].includes(item.stage)).length;

  return <Shell user={user}><div className="page distribution-page"><div className="page-title"><div><h1>Interní distribuce</h1><p>Valuace, distribuční připravenost a obchodní pipeline potvrzených aktiv FlatCloud.</p><span className="scope-context-badge">Interní obchodní modul · pouze FlatCloud Group</span></div><div className="action-row"><Link className="secondary" href="/portfolio/kvalita">Kvalita a CAPEX</Link><Link className="secondary" href="/distribuce/reporting">Distribuční reporting</Link><Link className="secondary" href="/distribuce/uvitaci-dopisy">Uvítací dopisy</Link><Link className="primary" href="/distribuce/zajemci">CRM zájemců</Link></div></div><Flash ok={query.ok} error={query.error}/>
    <div className="notice distribution-separation-note"><strong>Technický stav je samostatný podklad</strong><span>V tomto modulu se neupravuje kvalita bytu ani CAPEX. Distribuce pouze ověří, že je technický podklad dostupný, a pracuje s valuací a obchodní připraveností.</span></div>
    <div className="stat-grid v21-stat-grid distribution-kpis"><Stat label="Jednotky ve scope" value={String(units.length)} icon={<Home/>}/><Stat label="Technický podklad" value={`${conditions.length}/${units.length}`} icon={<ClipboardCheck/>}/><Stat label="Valuováno" value={`${valuations.length}/${units.length}`} icon={<Building2/>}/><Stat label="Tržní hodnota jednotek" value={money(marketValue)} icon={<Handshake/>}/><Stat label="Připraveno / otevřené příležitosti" value={`${ready} / ${openOpportunities}`} icon={<Users/>}/></div>
    <section className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Distribuční matice jednotek</h2><p>Technický podklad, valuace a distribuční připravenost mají oddělenou odpovědnost a historii.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Nájemní stav</th><th>Technický podklad</th><th>Tržní hodnota</th><th>Distribuce</th><th>Posouzeno</th><th></th></tr></thead><tbody>{units.length ? units.map((unit) => {
      const condition = unit.conditionAssessments[0];
      const assessment = unit.assetAssessments[0];
      const valuation = unit.valuationSnapshots[0];
      const activeLease = currentLeaseForUnit(unit.leases);
      return <tr key={unit.id}><td><Link className="entity-link" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}`}>{unit.property.name} · {unit.label}</Link><span className="owner-sub">{unit.areaM2 ? `${unit.areaM2.toLocaleString("cs-CZ")} m²` : "Plocha chybí"}</span></td><td>{activeLease?.tenant.name || "Volná jednotka"}</td><td>{condition ? <Link className="status ok" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>Hodnocení dostupné</Link> : <Link className="status warn" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>Doplnit hodnocení</Link>}</td><td>{valuation ? <><strong>{money(Number(valuation.marketValueCents))}</strong><span className="owner-sub">{unit.areaM2 ? `${money(Math.round(Number(valuation.marketValueCents) / unit.areaM2))}/m²` : unitValuationSources[valuation.source]}</span></> : <span className="status warn">Chybí valuace</span>}</td><td>{assessment ? <span className={`status ${assessment.distributionReady ? "ok" : "warn"}`}>{assessment.distributionReady ? "Připraveno" : "Nepřipraveno"}</span> : <span className="status">Neposouzeno</span>}</td><td>{assessment ? <><strong>{date(assessment.assessedAt)}</strong><span className="owner-sub">{assessment.createdBy.name}</span></> : "—"}</td><td><div className="distribution-actions"><DismissibleDetails className="distribution-assessment" summary="Změnit připravenost" dialogLabel="Změna distribuční připravenosti">{condition ? <form action={`/api/distribution/properties/${unit.property.id}/units/${unit.id}/assessments`} method="post"><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Datum posouzení *</span><input type="date" name="assessedAt" max={dateInput(new Date())} defaultValue={dateInput(new Date())} required/></label><label className="checkbox-field"><input type="checkbox" name="distributionReady" defaultChecked={assessment?.distributionReady || false}/><span>Interně připraveno pro distribuci</span></label><label className="field"><span>Poznámka / další krok</span><textarea name="note" rows={2} maxLength={2000} defaultValue={assessment?.note || ""}/></label><button className="primary" type="submit">Uložit nový stav</button></form> : <p className="muted-copy">Nejprve doplňte technické hodnocení v modulu Kvalita a CAPEX.</p>}</DismissibleDetails><DismissibleDetails className="distribution-assessment distribution-valuation" summary="Nová valuace" dialogLabel="Nová valuace jednotky"><form action={`/api/distribution/properties/${unit.property.id}/units/${unit.id}/valuations`} method="post"><input type="hidden" name="returnTo" value={returnTo}/><label className="field"><span>Tržní hodnota Kč *</span><input type="number" name="marketValue" min="0.01" step="0.01" required/></label><label className="field"><span>Zdroj *</span><select name="source" defaultValue="INTERNAL_COMPARABLES">{Object.entries(unitValuationSources).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Datum valuace *</span><input type="date" name="valuationDate" max={dateInput(new Date())} defaultValue={dateInput(new Date())} required/></label><label className="field"><span>Reference / číslo posudku</span><input name="reference"/></label><label className="field"><span>Poznámka</span><textarea name="note" rows={2}/></label><button className="primary" type="submit">Uložit novou valuaci</button></form>{unit.valuationSnapshots.length > 0 && <div className="assessment-history"><strong>Poslední valuace</strong>{unit.valuationSnapshots.map((row) => <span key={row.id}>{date(row.valuationDate)} · {money(Number(row.marketValueCents))} · {unitValuationSources[row.source]}</span>)}</div>}</DismissibleDetails></div></td></tr>;
    }) : <tr><td className="table-empty" colSpan={7}>V potvrzených aktivech FlatCloud zatím nejsou jednotky.</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="card stat"><div className="stat-icon blue">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
