import { PageHeading } from "@/components/PageHeading";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, moneyExact } from "@/lib/format";
import { propertyCostCategories, propertyCostKinds, propertyCostStatuses } from "@/lib/asset-finance";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";

import { documentAccessWhere } from "@/lib/documents/access";
import { comparePropertyBudget } from "@/lib/property-budget-comparison";

export const dynamic = "force-dynamic";
type Revision = { reason: string; before: { amountCents: number }; after: { amountCents: number } };

export default async function BudgetDetail({ params, searchParams }: { params: Promise<{ id: string; budgetId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, budgetId } = await params;
  const query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const membership = property.memberships.find(row => row.userId === user.id);
  if (!hasAllPropertyAccess(user) && !membership) notFound();
  const canManage = hasAllPropertyAccess(user) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  const line = await prisma.propertyBudgetLine.findFirst({ where: { id: budgetId, propertyId: id }, include: { conditionPlanExecution: true } });
  if (!line) notFound();
  const history = await prisma.auditLog.findMany({ where: { propertyId: id, entityType: "PropertyBudgetLine", entityId: budgetId, action: "PROPERTY_BUDGET_LIMIT_REVISED" }, include: { user: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const initialAmount = history.length ? (history[0].details as Revision).before.amountCents : line.amountCents;
  const costs = await prisma.propertyCost.findMany({ where: { propertyId: id, OR: [{ budgetLineId: budgetId }, { conditionPlanExecution: { budgetLineId: budgetId } }] }, include: { conditionPlanExecution: { select: { taskId: true } }, documents: { where: documentAccessWhere(user), select: { id: true, category: true } } }, orderBy: [{ effectiveAt: "desc" }, { id: "asc" }] });
  const comparison = comparePropertyBudget([line], costs, line.year).find(row => row.kind === line.kind && row.category === line.category)!;
  const linkHistory = await prisma.auditLog.findMany({ where: { propertyId: id, action: "PROPERTY_COST_BUDGET_LINK_CHANGED", entityType: "PropertyCost", OR: [{ details: { path: ["before", "budgetLineId"], equals: budgetId } }, { details: { path: ["after", "budgetLineId"], equals: budgetId } }] }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const financeUrl = `/nemovitosti/${id}/finance?financeYear=${line.year}`;
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={financeUrl}>{property.name}</Link><span>›</span><span>Rozpočet</span></div>
    <div className="page-title"><div><PageHeading>{line.title}</PageHeading><p>Rozpočet {line.year} · {propertyCostKinds[line.kind]} · {propertyCostCategories[line.category]}</p></div><Link className="secondary" href={financeUrl}>Zpět na finance</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/>
    <Flash ok={query.ok} error={query.error}/>
    <section className="card" aria-label="Limit rozpočtu"><h2>Limit rozpočtu</h2><div className="summary-list">
      <div><span>Výchozí doložený limit</span><strong>{moneyExact(initialAmount)}</strong></div>
      <div><span>Aktuální limit</span><strong>{moneyExact(line.amountCents)}</strong></div>
    </div><p className="muted-copy">Výchozí limit zachycuje stav před první evidovanou revizí. Starší neevidované změny z něj nelze určit.</p>
      <h3>Původní poznámka / zdroj</h3><p>{line.note || "Zdroj nebyl uveden."}</p>
    </section>
    {line.conditionPlanExecution && <p className="notice">Rozpočet je řízený přes Kvalitu a CAPEX. Zde je dostupný pro čtení.</p>}
    {canManage && !line.conditionPlanExecution && <details className="card"><summary>Změnit limit rozpočtu</summary><p>Revize zachová původní údaje a zapíše autora, čas i důvod změny. Uveďte také odkaz nebo označení podkladu, pokud změnu dokládá.</p>
      <form action={`/api/properties/${id}/budgets/${budgetId}`} method="post" className="form-grid" data-testid="budget-revision">
        <input type="hidden" name="expectedUpdatedAt" value={line.updatedAt.toISOString()}/><input type="hidden" name="requestId" value={randomUUID()}/>
        <label className="field"><span>Nový limit v Kč *</span><input name="amount" type="number" min="0.01" max="21474836.47" step="0.01" defaultValue={(line.amountCents / 100).toFixed(2)} required/></label>
        <label className="field"><span>Důvod změny / podklad *</span><textarea name="reason" maxLength={2000} required/></label>
        <label><input type="checkbox" name="confirmed" required/> Potvrzuji změnu limitu a její zaznamenání do historie.</label>
        <div className="form-actions"><button className="primary" type="submit">Zaznamenat revizi limitu</button></div>
      </form>
    </details>}
    <section className="card col-12" aria-label="Náklady přiřazené rozpočtu" data-testid="budget-cost-evidence"><h2>Náklady přiřazené rozpočtu</h2>
      <p>Čerpání této položky zahrnuje pouze přiřazené náklady za rok {line.year}. Zbývá = aktuální limit − objednáno − skutečnost. Plán se neodečítá a každý náklad se počítá jednou podle aktuálního stavu. Skutečnost není potvrzení úhrady.</p>
      <div className="summary-list"><div><span>Pracovní plán</span><strong>{moneyExact(comparison.plannedCents)}</strong></div><div><span>Objednáno</span><strong>{moneyExact(comparison.committedCents)}</strong></div><div><span>Skutečnost</span><strong>{moneyExact(comparison.actualCents)}</strong></div><div><span>Zbývá v této položce</span><strong>{moneyExact(comparison.remainingCents!)}</strong></div></div>
      <p className="muted-copy">Nepřiřazené náklady zůstávají v souhrnu kategorie na financích. Faktury a další podklady otevřete přes detail nákladu; nabídka sama nenahrazuje účetní doklad.</p>
      {costs.length ? <div className="table-wrap" role="region" aria-label="Přiřazené náklady; širokou tabulku lze posouvat" tabIndex={0}><table><thead><tr>{["Náklad", "Datum", "Období", "Stav", "Částka", "Podklady", "Realizace"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{costs.map(cost => <tr key={cost.id}>
        <th scope="row"><Link className="entity-link" href={`/nemovitosti/${id}/naklady/${cost.id}`}>{cost.title}</Link></th><td>{date(cost.effectiveAt)}</td><td>{cost.effectiveAt.getUTCFullYear() === line.year ? "V roce rozpočtu" : "Mimo rok rozpočtu"}</td><td>{propertyCostStatuses[cost.status]}</td><td>{moneyExact(cost.amountCents)}</td>
        <td>{cost.documents.some(doc => doc.category === "INVOICE") ? "Faktura dostupná" : "Není dostupná faktura"}{cost.documents.length > 0 && ` · ${cost.documents.length} podkladů`}</td>
        <td>{(cost.taskId || cost.conditionPlanExecution?.taskId) ? <Link href={`/ukoly/${cost.taskId || cost.conditionPlanExecution?.taskId}`}>Otevřít úkol</Link> : "Bez úkolu"}</td>
      </tr>)}</tbody></table></div> : <p>Zatím není přiřazen žádný náklad. Přiřazení nastavíte v detailu nákladu na financích.</p>}
    </section>
    {linkHistory.length > 0 && <section className="card" aria-label="Historie vazeb na náklady"><h2>Historie vazeb na náklady</h2>{linkHistory.map(event => { const data = event.details as { reason: string; costTitle: string; before: {budgetLineId: string | null; title: string | null}; after: {budgetLineId: string | null; title: string | null} }; return <article key={event.id}><h3><Link href={`/nemovitosti/${id}/naklady/${event.entityId}`}>{data.costTitle}</Link></h3><p>{event.user?.name || "Systém"} · {event.createdAt.toLocaleString("cs-CZ")}</p><p>{data.before.title || "Bez přiřazení"} → {data.after.title || "Bez přiřazení"}</p><p>{data.reason}</p></article>; })}</section>}
    <section className="card" aria-label="Historie revizí rozpočtu"><h2>Historie revizí rozpočtu</h2>
      {!history.length && <p>Zatím nebyla zaznamenána žádná revize limitu.</p>}
      {history.map(event => { const revision = event.details as Revision; return <article key={event.id}><h3>{moneyExact(revision.before.amountCents)} → {moneyExact(revision.after.amountCents)}</h3><p>{event.user?.name || "Systém"} · {event.createdAt.toLocaleString("cs-CZ")}</p><p style={{ whiteSpace: "pre-wrap" }}>{revision.reason}</p></article>; })}
    </section>
  </div></Shell>;
}
