import Link from "next/link";
import { notFound } from "next/navigation";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { dateInput } from "@/lib/forms";
import { date, moneyExact } from "@/lib/format";
import { documentAccessWhere } from "@/lib/documents/access";
import { propertyCostCategories, propertyCostKinds, propertyCostStatuses } from "@/lib/asset-finance";
import { propertyCostScopeLabel } from "@/lib/property-cost-allocations";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";

export const dynamic = "force-dynamic";

export default async function PropertyCostDetail({ params, searchParams }: { params: Promise<{ id: string; costId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, costId } = await params;
  const query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const propertyWide = hasAllPropertyAccess(user) || Boolean(membership);
  if (!propertyWide) notFound();
  const canManage = hasAllPropertyAccess(user) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  const cost = await prisma.propertyCost.findFirst({
    where: { id: costId, propertyId: id },
    include: {
      unit: true,
      task: true,
      conditionPlanExecution: true,
      allocations: { include: { unit: true }, orderBy: { unit: { label: "asc" } } },
      documents: {
        where: documentAccessWhere(user),
        orderBy: { createdAt: "desc" },
        include: { fileAsset: true, property: { select: { name: true } }, unit: { select: { label: true } }, propertyCost: { select: { title: true } } },
      },
    },
  });
  if (!cost) notFound();
  const tasks = canManage ? await prisma.task.findMany({ where: { propertyId: id, ...(cost.unitId ? { OR: [{ unitId: cost.unitId }, { unitId: null, leaseId: null }] } : {}) }, select: { id: true, title: true }, orderBy: { title: "asc" } }) : [];
  const history = await prisma.auditLog.findMany({ where: { entityType: "PropertyCost", entityId: cost.id, propertyId: id, action: "PROPERTY_COST_UPDATED" }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const returnTo = `/nemovitosti/${id}/naklady/${cost.id}`;
  const allocationByUnit = new Map(cost.allocations.map((row) => [row.unitId, row]));
  const allocatedAmountCents = cost.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  const allocatedShareBasisPoints = cost.allocations.reduce((sum, row) => sum + row.shareBasisPoints, 0);
  const allUnitsHaveArea = property.units.length > 0 && property.units.every((unit) => unit.areaM2 && unit.areaM2 > 0);
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/finance`}>{property.name}</Link><span>›</span><span>{cost.title}</span></div>
    <div className="page-title"><div><h1>{cost.title}</h1><p>{propertyCostKinds[cost.kind]} · {propertyCostStatuses[cost.status]} · {date(cost.effectiveAt)}</p></div><Link className="secondary" href={`/nemovitosti/${id}/finance#naklady`}>Zpět na finance</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/>
    <Flash ok={query.ok} error={query.error}/>
    {cost.task&&<p><Link href={`/ukoly/${cost.task.id}`}>Související úkol: {cost.task.title}</Link></p>}
    {canManage&&!cost.conditionPlanExecution&&<details className="card"><summary>Upravit náklad a stav</summary><p>Změna upraví tento náklad. Nevytvoří další závazek ani bankovní platbu. Podíly jednotek a doklady zůstanou zachované.</p><form action={`/api/properties/${id}/costs/${cost.id}`} method="post" className="form-grid" data-testid="cost-edit">
      <input type="hidden" name="expectedUpdatedAt" value={cost.updatedAt.toISOString()}/>
      <label className="field"><span>Název *</span><input name="title" defaultValue={cost.title} required/></label>
      <label className="field"><span>Částka v Kč *</span><input name="amount" type="number" min="0.01" step="0.01" max="21474836.47" defaultValue={(cost.amountCents/100).toFixed(2)} required/></label>
      <label className="field"><span>Typ *</span><select aria-label="Typ *" name="kind" defaultValue={cost.kind}>{Object.entries(propertyCostKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Stav *</span><select aria-label="Stav *" name="status" defaultValue={cost.status}>{Object.entries(propertyCostStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Kategorie *</span><select aria-label="Kategorie *" name="category" defaultValue={cost.category}>{Object.entries(propertyCostCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Datum plánu / vzniku *</span><input name="effectiveAt" type="date" defaultValue={dateInput(cost.effectiveAt)} required/></label>
      <label className="field"><span>Dodavatel</span><input name="vendor" defaultValue={cost.vendor||""}/></label>
      <label className="field"><span>Číslo dokladu</span><input name="documentNumber" defaultValue={cost.documentNumber||""}/></label>
      <label className="field"><span>Související úkol</span><select aria-label="Související úkol" name="taskId" defaultValue={cost.taskId||""}><option value="">Bez vazby</option>{tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label className="field"><span>Poznámka</span><textarea name="note" defaultValue={cost.note||""}/></label>
      <label className="field"><span>Důvod změny *</span><textarea name="reason" required/></label><div className="form-actions"><button className="primary" type="submit">Uložit změnu nákladu</button></div>
    </form></details>}
    {cost.conditionPlanExecution&&<p className="notice">Náklad je řízený přes Kvalitu a CAPEX.</p>}
    <div className="detail-grid">
      <div className="card col-5"><h2>Účetní kontext</h2><div className="summary-list"><div><span>Částka</span><strong>{moneyExact(cost.amountCents)}</strong></div><div><span>Kategorie</span><strong>{propertyCostCategories[cost.category]}</strong></div><div><span>Rozsah nákladu</span><strong>{propertyCostScopeLabel(cost)}</strong></div><div><span>Dodavatel</span><strong>{cost.vendor||"Neuveden"}</strong></div><div><span>Číslo dokladu</span><strong>{cost.documentNumber||"Neuvedeno"}</strong></div></div>{cost.note&&<p className="technical-note">{cost.note}</p>}</div>
      <div className="card col-7"><div className="card-head"><div><h2>Účetní podklady</h2><p className="muted-copy">Faktura nebo účetní doklad potvrzuje skutečný výdaj. Nabídka a jiná příloha zůstávají podpůrným zdrojem, ale samy účetní doklad nenahrazují.</p></div></div>{canManage&&<DocumentUploadForm propertyId={id} unitId={cost.unitId||undefined} propertyCostId={cost.id} returnTo={returnTo} categories={[["INVOICE","Faktura / účetní doklad"],["OFFER","Nabídka (podpůrný podklad)"],["OTHER","Jiný podpůrný podklad"]]} title={cost.documentNumber?`${cost.title} · ${cost.documentNumber}`:cost.title}/>}<DocumentAttachments documents={cost.documents} canDelete={canManage} returnTo={returnTo}/></div>
      <div className="card col-12 cost-allocation-card" data-testid="cost-allocation"><div className="card-head"><div><h2>Rozdělení nákladu na jednotky</h2><p className="muted-copy">Určuje, jaká část nákladu vstoupí do ekonomiky konkrétních jednotek. Nemění celkovou částku ani účetní podklady.</p></div><span className={`status ${allocatedShareBasisPoints===10_000&&allocatedAmountCents===cost.amountCents?"ok":cost.allocations.length?"bad":""}`}>{cost.allocations.length?`${(allocatedShareBasisPoints/100).toLocaleString("cs-CZ")} % rozděleno`:"Bez rozdělení"}</span></div>
        {cost.allocations.length?<div className="table-wrap"><table><thead><tr><th>Jednotka</th><th>Výměra</th><th>Podíl</th><th>Částka</th></tr></thead><tbody>{cost.allocations.map((row)=><tr key={row.id}><td><Link className="entity-link" href={`/nemovitosti/${id}/jednotky/${row.unitId}`}>{row.unit.label}</Link></td><td>{row.unit.areaM2?`${row.unit.areaM2.toLocaleString("cs-CZ")} m²`:"Neuvedena"}</td><td>{(row.shareBasisPoints/100).toLocaleString("cs-CZ")} %</td><td><strong>{moneyExact(row.amountCents)}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Celkem</th><th>{(allocatedShareBasisPoints/100).toLocaleString("cs-CZ")} %</th><th>{moneyExact(allocatedAmountCents)}</th></tr></tfoot></table></div>:<div className="notice">Náklad je veden za celý objekt. Do výsledků jednotlivých jednotek zatím nevstupuje.</div>}
        {canManage&&<div className="cost-allocation-actions"><div className="cost-allocation-choice"><h3>Rychlé rozdělení celého domu</h3><p className="muted-copy">Použije všechny jednotky a přesně dorovná zaokrouhlení na celkovou částku.</p><form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="form-actions"><button className="secondary" type="submit" name="mode" value="equal">Rozdělit rovnoměrně</button><button className="secondary" type="submit" name="mode" value="area" disabled={!allUnitsHaveArea}>Rozdělit podle plochy</button></form>{!allUnitsHaveArea&&<small className="bad">Rozdělení podle plochy bude dostupné po doplnění výměry u všech jednotek.</small>}</div>
          <form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="cost-allocation-choice"><input type="hidden" name="mode" value="custom"/><div><h3>Vlastní podíly</h3><p className="muted-copy">Vyplňte pouze zahrnuté jednotky. Součet musí být přesně 100 %.</p></div><div className="cost-allocation-inputs">{property.units.map((unit)=>{const allocation=allocationByUnit.get(unit.id);return <label className="field" key={unit.id}><span>Jednotka {unit.label} (%)</span><input aria-label={`Jednotka ${unit.label} (%)`} name={`share-${unit.id}`} type="number" min="0.01" max="100" step="0.01" defaultValue={allocation?allocation.shareBasisPoints/100:""} placeholder="0"/><small>{unit.areaM2?`${unit.areaM2.toLocaleString("cs-CZ")} m²`:"výměra neuvedena"}</small></label>})}</div><div className="form-actions"><button className="primary" type="submit">Uložit vlastní rozdělení</button></div></form>
          {(cost.allocations.length>0||cost.unitId)&&<form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="cost-allocation-clear"><input type="hidden" name="mode" value="clear"/><div><strong>Zrušit rozdělení na jednotky</strong><p className="muted-copy">Náklad se vrátí na celý objekt. Celková částka a přiložené podklady zůstanou zachované.</p></div><button className="secondary" type="submit">Vrátit na celý objekt</button></form>}
        </div>}
      </div>
    </div>
    {history.length>0&&<section className="card"><h2>Historie změn nákladu</h2>{history.map(event=>{const details=event.details as {reason?:string;before?:{status?:string;amountCents?:number};after?:{status?:string;amountCents?:number}};return <article key={event.id}><strong>{event.user?.name||"Systém"} · {event.createdAt.toLocaleString("cs-CZ")}</strong><p>{details.reason}</p><p>{propertyCostStatuses[details.before?.status as keyof typeof propertyCostStatuses]||details.before?.status} → {propertyCostStatuses[details.after?.status as keyof typeof propertyCostStatuses]||details.after?.status} · {moneyExact(details.before?.amountCents||0)} → {moneyExact(details.after?.amountCents||0)}</p></article>})}</section>}
  </div></Shell>;
}
