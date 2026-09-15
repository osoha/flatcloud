import Link from "next/link";
import { CalendarRange, CircleDollarSign, ClockAlert, Hammer } from "lucide-react";
import { Shell } from "@/components/Shell";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { PortfolioQualitySubnav } from "@/components/portfolio/PortfolioQualitySubnav";
import { accessibleProperties } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { parsePortfolioSelection, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";
import { buildCapexRenewalForecast, capexForecastStageLabels } from "@/lib/portfolio/capex-renewal-forecast";

export const dynamic = "force-dynamic";

export default async function PortfolioCapexPlanPage({ searchParams }: { searchParams: Promise<{ properties?: string }> }) {
  const user = await requireUser();
  const [availableProperties, query] = await Promise.all([accessibleProperties(user, { includeInactive: true }), searchParams]);
  const selection = parsePortfolioSelection(query);
  const allowedPropertyIds = selectedPropertyIds(selection, availableProperties.map((property) => property.id));
  const selected = new Set(allowedPropertyIds);
  const properties = availableProperties.filter((property) => selected.has(property.id));
  const unitRows = properties.flatMap((property) => property.units.map((unit) => ({ property, unit })));
  const unitIds = unitRows.map((row) => row.unit.id);
  const assessments = unitIds.length ? await prisma.unitConditionAssessment.findMany({
    where: { unitId: { in: unitIds } },
    distinct: ["unitId"],
    orderBy: [{ unitId: "asc" }, { assessedAt: "desc" }, { createdAt: "desc" }],
    include: { execution: { include: { events: { orderBy: { effectiveAt: "asc" } } } } },
  }) : [];
  const units = new Map(unitRows.map((row) => [row.unit.id, row]));
  const baseYear = new Date().getUTCFullYear();
  const forecast = buildCapexRenewalForecast(assessments.map((assessment) => {
    const row = units.get(assessment.unitId)!;
    return { id: assessment.id, propertyId: row.property.id, propertyName: row.property.name, unitId: row.unit.id, unitLabel: row.unit.label, planStatus: assessment.planStatus, plannedAmountCents: assessment.estimatedCapexCents, targetDate: assessment.targetDate, events: assessment.execution?.events || [] };
  }), baseYear);
  const selectionValue = serializePortfolioSelection(selection);
  const selectionQuery = selectionValue === null ? "" : `?properties=${encodeURIComponent(selectionValue)}`;
  const pickerProperties = availableProperties.map(({ id, name, address, city, active, owner, communicationOwner, flatcloudConsolidationBasisPoints }) => ({ id, name, address, city, active, ownerId: communicationOwner?.id || owner.id, ownerName: communicationOwner?.name || owner.name, scopeKind: flatcloudConsolidationBasisPoints == null ? "UNCLASSIFIED" as const : flatcloudConsolidationBasisPoints > 0 ? "FLATCLOUD" as const : "EXTERNAL" as const }));
  const maxBucketAmount = Math.max(1, ...forecast.buckets.map((bucket) => bucket.plannedAmountCents));

  return <Shell user={user}><div className="page portfolio-quality-page capex-forecast-page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/portfolio/kvalita${selectionQuery}`}>Kvalita a CAPEX</Link><span>›</span><span>CAPEX výhled</span></div>
    <div className="page-title"><div><h1>Plán obnovy a CAPEX výhled</h1><p>Pětiletý souhrn aktuálních technických plánů napříč zvoleným portfoliem.</p><span className="scope-context-badge">Provozní plán · bez vazby na interní Distribuci</span></div><PortfolioScopePicker availableProperties={pickerProperties} selection={selection.mode === "ALL" ? selection : { mode: "SELECTED", propertyIds: allowedPropertyIds }}/></div>
    <PortfolioQualitySubnav active="forecast" query={selectionQuery}/>
    <div className="stat-grid v21-stat-grid quality-kpis"><Stat icon={<CalendarRange/>} label={`Výhled ${baseYear}–${baseYear + 4}`} value={money(forecast.scheduledFiveYearCents)}/><Stat icon={<ClockAlert/>} label="Po termínu / bez termínu" value={`${money(forecast.overdueCents)} / ${money(forecast.unscheduledCents)}`}/><Stat icon={<Hammer/>} label="Právě v realizaci" value={money(forecast.inProgressCents)}/><Stat icon={<CircleDollarSign/>} label={`Skutečnost ${baseYear}`} value={money(forecast.actualThisYearCents)} note={`Odchylka ${forecast.actualVarianceThisYearCents > 0 ? "+" : ""}${money(forecast.actualVarianceThisYearCents)}`}/></div>
    <section className="card capex-timeline-card"><div className="table-toolbar"><div><h2>Časová mapa obnovy</h2><p>Výše sloupce odpovídá plánovanému CAPEX v daném období; rozpad odlišuje záměry, schválené akce a probíhající realizace.</p></div></div><div className="capex-timeline" role="img" aria-label="Plánovaný CAPEX podle období">{forecast.buckets.map((bucket) => <div className={`capex-timeline-column ${bucket.key === "OVERDUE" || bucket.key === "UNSCHEDULED" ? "attention" : ""}`} key={bucket.key}><div className="capex-timeline-value"><strong>{money(bucket.plannedAmountCents)}</strong><span>{bucket.count} {bucket.count === 1 ? "akce" : "akcí"}</span></div><div className="capex-timeline-track"><i className="intent" style={{ height: `${Math.round(bucket.intentAmountCents / maxBucketAmount * 100)}%` }}/><i className="approved" style={{ height: `${Math.round(bucket.approvedAmountCents / maxBucketAmount * 100)}%` }}/><i className="in-progress" style={{ height: `${Math.round(bucket.inProgressAmountCents / maxBucketAmount * 100)}%` }}/></div><b>{bucket.label}</b></div>)}</div><div className="capex-stage-legend"><span className="intent">Záměr</span><span className="approved">Schváleno</span><span className="in-progress">V realizaci</span></div></section>
    <section className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Aktivní plán obnovy</h2><p>Jednotlivé položky zůstávají dohledatelné v technickém detailu jednotky.</p></div></div><div className="table-wrap"><table><thead><tr><th>Termín</th><th>Nemovitost / jednotka</th><th>Fáze</th><th>Plánovaný CAPEX</th></tr></thead><tbody>{forecast.active.length ? [...forecast.active].sort((a, b) => (a.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER) || b.plannedAmountCents - a.plannedAmountCents).map((item) => <tr key={item.id}><td>{item.targetDate ? date(item.targetDate) : <span className="status warn">Bez termínu</span>}</td><td><Link className="entity-link" href={`/nemovitosti/${item.propertyId}/jednotky/${item.unitId}#kvalita`}>{item.propertyName} · {item.unitLabel}</Link></td><td><span className={`status ${item.stage === "IN_PROGRESS" ? "warn" : item.stage === "APPROVED" ? "ok" : ""}`}>{capexForecastStageLabels[item.stage]}</span></td><td className="money"><strong>{money(item.plannedAmountCents)}</strong></td></tr>) : <tr><td colSpan={4} className="table-empty">Ve zvoleném rozsahu nejsou žádné aktivní plány obnovy.</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return <div className="card stat"><div className="stat-icon blue">{icon}</div><div><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div></div>;
}
