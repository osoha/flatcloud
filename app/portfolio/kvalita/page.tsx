import Link from "next/link";
import { CalendarClock, ClipboardCheck, Hammer, Home } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { UnitConditionAssessmentForm } from "@/components/portfolio/UnitConditionAssessmentForm";
import { accessibleProperties } from "@/lib/access";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { parsePortfolioSelection, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";
import { unitConditionPlanStatuses, unitConditionRatings, unitConditionUrgencies } from "@/lib/portfolio/unit-condition-assessments";

export const dynamic = "force-dynamic";

export default async function PortfolioQualityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; properties?: string }> }) {
  const user = await requireUser();
  const [availableProperties, query] = await Promise.all([accessibleProperties(user, { includeInactive: true }), searchParams]);
  const selection = parsePortfolioSelection(query);
  const allowedPropertyIds = selectedPropertyIds(selection, availableProperties.map((property) => property.id));
  const selected = new Set(allowedPropertyIds);
  const properties = availableProperties.filter((property) => selected.has(property.id));
  const units = properties.flatMap((property) => property.units.map((unit) => ({ ...unit, property })));
  const unitIds = units.map((unit) => unit.id);
  const latest = unitIds.length ? await prisma.unitConditionAssessment.findMany({
    where: { unitId: { in: unitIds } },
    distinct: ["unitId"],
    orderBy: [{ unitId: "asc" }, { assessedAt: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  }) : [];
  const byUnit = new Map(latest.map((row) => [row.unitId, row]));
  const assessed = units.filter((unit) => byUnit.has(unit.id)).length;
  const urgent = latest.filter((row) => row.investmentUrgency === "IMMEDIATE").length;
  const inProgress = latest.filter((row) => row.planStatus === "IN_PROGRESS").length;
  const plannedCapex = latest.filter((row) => row.planStatus !== "COMPLETED").reduce((sum, row) => sum + row.estimatedCapexCents, 0);
  const fullAccess = hasAllPropertyAccess(user);
  const selectionValue = serializePortfolioSelection(selection);
  const returnTo = selectionValue === null ? "/portfolio/kvalita" : `/portfolio/kvalita?properties=${encodeURIComponent(selectionValue)}`;
  const pickerProperties = availableProperties.map(({ id, name, address, city, active, owner, communicationOwner, flatcloudConsolidationBasisPoints }) => ({ id, name, address, city, active, ownerId: communicationOwner?.id || owner.id, ownerName: communicationOwner?.name || owner.name, scopeKind: flatcloudConsolidationBasisPoints == null ? "UNCLASSIFIED" as const : flatcloudConsolidationBasisPoints > 0 ? "FLATCLOUD" as const : "EXTERNAL" as const }));

  return <Shell user={user}><div className="page portfolio-quality-page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Kvalita a CAPEX</span></div>
    <div className="page-title"><div><h1>Kvalita a technický stav portfolia</h1><p>Neutrální evidence stavu bytů a plánování obnovy bez vazby na budoucí prodej.</p><span className="scope-context-badge">Provozní a asset pohled · všechna spravovaná aktiva</span></div><PortfolioScopePicker availableProperties={pickerProperties} selection={selection.mode === "ALL" ? selection : { mode: "SELECTED", propertyIds: allowedPropertyIds }}/></div>
    <Flash ok={query.ok} error={query.error}/>
    <div className="stat-grid v21-stat-grid quality-kpis"><Stat icon={<Home/>} label="Jednotky ve scope" value={String(units.length)}/><Stat icon={<ClipboardCheck/>} label="Aktuálně hodnoceno" value={`${assessed}/${units.length}`}/><Stat icon={<CalendarClock/>} label="Řešit ihned / probíhá" value={`${urgent} / ${inProgress}`}/><Stat icon={<Hammer/>} label="Odhad otevřeného CAPEX" value={money(plannedCapex)}/></div>
    <section className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Stav jednotek a plán obnovy</h2><p>Každé uložení vytvoří nový neměnný snapshot. Distribuční připravenost a tržní valuace se spravují odděleně.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Kvalita</th><th>Naléhavost</th><th>Plán</th><th>Odhad CAPEX</th><th>Hodnoceno</th><th></th></tr></thead><tbody>{units.length ? units.map((unit) => {
      const assessment = byUnit.get(unit.id);
      const propertyMembership = unit.property.memberships.find((row) => row.userId === user.id);
      const unitMembership = unit.userAccesses.find((row) => row.userId === user.id);
      const canManage = unit.property.active && (fullAccess || ["EDIT", "ADMIN"].includes(propertyMembership?.permission || "") || ["EDIT", "ADMIN"].includes(unitMembership?.permission || ""));
      return <tr key={unit.id}><td><Link className="entity-link" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>{unit.property.name} · {unit.label}</Link><span className="owner-sub">{unit.areaM2 ? `${unit.areaM2.toLocaleString("cs-CZ")} m²` : "Plocha chybí"}{!unit.property.active ? " · archivováno" : ""}</span></td><td>{assessment ? <span className={`rating-badge rating-${assessment.rating.slice(0, 1).toLowerCase()}`}>{unitConditionRatings[assessment.rating]}</span> : <span className="status warn">Nehodnoceno</span>}</td><td>{assessment ? unitConditionUrgencies[assessment.investmentUrgency] : "—"}</td><td>{assessment ? <><span className={`status ${assessment.planStatus === "COMPLETED" ? "ok" : assessment.planStatus === "IN_PROGRESS" ? "warn" : ""}`}>{unitConditionPlanStatuses[assessment.planStatus]}</span><span className="owner-sub">{assessment.targetDate ? `Cíl ${date(assessment.targetDate)}` : "Bez termínu"}</span></> : "—"}</td><td className="money">{assessment ? money(assessment.estimatedCapexCents) : "—"}</td><td>{assessment ? <><strong>{date(assessment.assessedAt)}</strong><span className="owner-sub">{assessment.createdBy.name}</span></> : "—"}</td><td>{canManage ? <details className="distribution-assessment condition-assessment"><summary>Nový snapshot</summary><UnitConditionAssessmentForm propertyId={unit.property.id} unitId={unit.id} returnTo={returnTo} assessment={assessment}/></details> : <Link className="table-link" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>Detail</Link>}</td></tr>;
    }) : <tr><td className="table-empty" colSpan={7}>Ve zvoleném rozsahu nejsou žádné jednotky.</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card stat"><div className="stat-icon blue">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
