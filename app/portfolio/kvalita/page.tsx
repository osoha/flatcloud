import Link from "next/link";
import { CalendarClock, ClipboardCheck, Hammer, Home } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { UnitConditionAssessmentForm } from "@/components/portfolio/UnitConditionAssessmentForm";
import { UnitConditionExecutionForm } from "@/components/portfolio/UnitConditionExecutionForm";
import { UnitConditionExecutionProgressForm } from "@/components/portfolio/UnitConditionExecutionProgressForm";
import { DismissibleDetails } from "@/components/DismissibleDetails";
import { accessibleProperties } from "@/lib/access";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { parsePortfolioSelection, selectedPropertyIds, serializePortfolioSelection } from "@/lib/portfolio-selection";
import { unitConditionPlanStatuses, unitConditionRatings, unitConditionUrgencies } from "@/lib/portfolio/unit-condition-assessments";
import { unitConditionCapexVariance, unitConditionExecutionState, unitConditionPriority } from "@/lib/portfolio/unit-condition-execution";

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
  const [latest, openExecutions] = unitIds.length ? await Promise.all([prisma.unitConditionAssessment.findMany({
    where: { unitId: { in: unitIds } },
    distinct: ["unitId"],
    orderBy: [{ unitId: "asc" }, { assessedAt: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } }, execution: { include: { events: { orderBy: { effectiveAt: "asc" } }, task: { select: { id: true, status: true } }, propertyCost: { select: { id: true, status: true, amountCents: true, effectiveAt: true } }, budgetLine: { select: { id: true, year: true } } } } },
  }), prisma.unitConditionPlanExecution.findMany({ where: { assessment: { unitId: { in: unitIds } }, task: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } } }, select: { assessment: { select: { unitId: true } } } })]) : [[], []];
  const openExecutionUnitIds = new Set(openExecutions.map((row) => row.assessment.unitId));
  const byUnit = new Map(latest.map((row) => [row.unitId, row]));
  const rows = units.map((unit) => { const assessment = byUnit.get(unit.id); const executionState = assessment?.execution ? unitConditionExecutionState(assessment.execution.events) : null; const priority = assessment ? unitConditionPriority(executionState?.key === "COMPLETED" ? { ...assessment, planStatus: "COMPLETED" } : assessment) : null; return { unit, assessment, executionState, priority }; }).sort((a, b) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1) || a.unit.property.name.localeCompare(b.unit.property.name, "cs") || a.unit.label.localeCompare(b.unit.label, "cs"));
  const assessed = units.filter((unit) => byUnit.has(unit.id)).length;
  const urgent = latest.filter((row) => row.investmentUrgency === "IMMEDIATE").length;
  const inProgress = latest.filter((row) => row.planStatus === "IN_PROGRESS" || (row.execution && unitConditionExecutionState(row.execution.events).key === "STARTED")).length;
  const approvedToExecute = latest.filter((row) => row.planStatus === "APPROVED" && !row.execution && !openExecutionUnitIds.has(row.unitId)).length;
  const plannedCapex = latest.filter((row) => row.planStatus !== "COMPLETED" && (!row.execution || unitConditionExecutionState(row.execution.events).key !== "COMPLETED")).reduce((sum, row) => sum + row.estimatedCapexCents, 0);
  const fullAccess = hasAllPropertyAccess(user);
  const selectionValue = serializePortfolioSelection(selection);
  const returnTo = selectionValue === null ? "/portfolio/kvalita" : `/portfolio/kvalita?properties=${encodeURIComponent(selectionValue)}`;
  const pickerProperties = availableProperties.map(({ id, name, address, city, active, owner, communicationOwner, flatcloudConsolidationBasisPoints }) => ({ id, name, address, city, active, ownerId: communicationOwner?.id || owner.id, ownerName: communicationOwner?.name || owner.name, scopeKind: flatcloudConsolidationBasisPoints == null ? "UNCLASSIFIED" as const : flatcloudConsolidationBasisPoints > 0 ? "FLATCLOUD" as const : "EXTERNAL" as const }));

  return <Shell user={user}><div className="page portfolio-quality-page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Kvalita a CAPEX</span></div>
    <div className="page-title"><div><h1>Kvalita a technický stav portfolia</h1><p>Neutrální evidence stavu bytů a plánování obnovy bez vazby na budoucí prodej.</p><span className="scope-context-badge">Provozní a asset pohled · všechna spravovaná aktiva</span></div><PortfolioScopePicker availableProperties={pickerProperties} selection={selection.mode === "ALL" ? selection : { mode: "SELECTED", propertyIds: allowedPropertyIds }}/></div>
    <Flash ok={query.ok} error={query.error}/>
    <div className="stat-grid v21-stat-grid quality-kpis"><Stat icon={<Home/>} label="Jednotky ve scope" value={String(units.length)}/><Stat icon={<ClipboardCheck/>} label="Aktuálně hodnoceno" value={`${assessed}/${units.length}`}/><Stat icon={<CalendarClock/>} label="Řešit ihned / probíhá" value={`${urgent} / ${inProgress}`}/><Stat icon={<Hammer/>} label="Ke spuštění / otevřený CAPEX" value={`${approvedToExecute} · ${money(plannedCapex)}`}/></div>
    <section className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Prioritní fronta obnovy</h2><p>Pořadí kombinuje stav, naléhavost, fázi plánu a prošlý termín. Realizace drží schválený plán, skutečný náklad a odchylku v jedné auditní stopě.</p></div></div><div className="table-wrap"><table><thead><tr><th>Priorita</th><th>Nemovitost / jednotka</th><th>Kvalita</th><th>Naléhavost</th><th>Plán</th><th>CAPEX plán / skutečnost</th><th>Hodnoceno</th><th></th></tr></thead><tbody>{rows.length ? rows.map(({ unit, assessment, executionState, priority }) => {
      const propertyMembership = unit.property.memberships.find((row) => row.userId === user.id);
      const unitMembership = unit.userAccesses.find((row) => row.userId === user.id);
      const canManage = unit.property.active && (fullAccess || ["EDIT", "ADMIN"].includes(propertyMembership?.permission || "") || ["EDIT", "ADMIN"].includes(unitMembership?.permission || ""));
      const hasOpenExecution = openExecutionUnitIds.has(unit.id);
      const actualAmountCents = executionState?.key === "COMPLETED" ? executionState.event.actualAmountCents : null;
      const variance = assessment ? unitConditionCapexVariance(assessment.estimatedCapexCents, actualAmountCents) : null;
      return <tr key={unit.id}><td>{priority ? <span className={`status ${priority.tone}`}>{priority.label}</span> : "—"}</td><td><Link className="entity-link" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>{unit.property.name} · {unit.label}</Link><span className="owner-sub">{unit.areaM2 ? `${unit.areaM2.toLocaleString("cs-CZ")} m²` : "Plocha chybí"}{!unit.property.active ? " · archivováno" : ""}</span></td><td>{assessment ? <span className={`rating-badge rating-${assessment.rating.slice(0, 1).toLowerCase()}`}>{unitConditionRatings[assessment.rating]}</span> : <span className="status warn">Nehodnoceno</span>}</td><td>{assessment ? unitConditionUrgencies[assessment.investmentUrgency] : "—"}</td><td>{assessment ? <><span className={`status ${executionState?.tone || (assessment.planStatus === "COMPLETED" ? "ok" : assessment.planStatus === "IN_PROGRESS" ? "warn" : "")}`}>{executionState?.label || unitConditionPlanStatuses[assessment.planStatus]}</span><span className="owner-sub">{executionState?.event ? `${executionState.key === "COMPLETED" ? "Dokončeno" : "Zahájeno"} ${date(executionState.event.effectiveAt)}` : assessment.targetDate ? `Cíl ${date(assessment.targetDate)}` : "Bez termínu"}</span></> : "—"}</td><td className="money">{assessment ? <><strong>{money(assessment.estimatedCapexCents)}</strong>{actualAmountCents != null && <span className="owner-sub">Skutečnost {money(actualAmountCents)}</span>}{variance && <span className={`owner-sub ${variance.amountCents > 0 ? "negative" : "positive"}`}>Odchylka {variance.amountCents > 0 ? "+" : ""}{money(variance.amountCents)}</span>}</> : "—"}</td><td>{assessment ? <><strong>{date(assessment.assessedAt)}</strong><span className="owner-sub">{assessment.createdBy.name}</span></> : "—"}</td><td><div className="quality-row-actions">{assessment?.execution && <><div className="execution-links"><Link href={`/ukoly/${assessment.execution.task.id}`}>Úkol</Link><Link href={`/nemovitosti/${unit.property.id}/naklady/${assessment.execution.propertyCost.id}`}>CAPEX</Link><Link href={`/nemovitosti/${unit.property.id}/finance?financeYear=${assessment.execution.budgetLine.year}#rozpocet`}>Rozpočet</Link></div>{canManage && executionState && executionState.key !== "COMPLETED" && <DismissibleDetails className="condition-execution" summary="Řídit realizaci" dialogLabel="Průběh CAPEX realizace"><UnitConditionExecutionProgressForm propertyId={unit.property.id} unitId={unit.id} executionId={assessment.execution.id} state={executionState.key} plannedAmountCents={assessment.estimatedCapexCents} returnTo={returnTo}/></DismissibleDetails>}</>}{!assessment?.execution && (hasOpenExecution ? <span className="status warn">Otevřená realizace</span> : canManage && assessment?.planStatus === "APPROVED" ? <DismissibleDetails className="condition-execution" summary="Převést plán" dialogLabel="Převést schválený plán"><UnitConditionExecutionForm propertyId={unit.property.id} unitId={unit.id} assessmentId={assessment.id} unitLabel={unit.label} returnTo={returnTo}/></DismissibleDetails> : null)}{canManage ? <DismissibleDetails className="distribution-assessment condition-assessment" summary="Nový snapshot" dialogLabel="Nové hodnocení kvality"><UnitConditionAssessmentForm propertyId={unit.property.id} unitId={unit.id} returnTo={returnTo} assessment={assessment}/></DismissibleDetails> : <Link className="table-link" href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}#kvalita`}>Detail</Link>}</div></td></tr>;
    }) : <tr><td className="table-empty" colSpan={8}>Ve zvoleném rozsahu nejsou žádné jednotky.</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card stat"><div className="stat-icon blue">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
