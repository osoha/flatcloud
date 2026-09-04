import Link from "next/link";
import { notFound } from "next/navigation";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
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
      allocations: { include: { unit: true }, orderBy: { unit: { label: "asc" } } },
      documents: {
        where: documentAccessWhere(user),
        orderBy: { createdAt: "desc" },
        include: { fileAsset: true, property: { select: { name: true } }, unit: { select: { label: true } }, propertyCost: { select: { title: true } } },
      },
    },
  });
  if (!cost) notFound();
  const returnTo = `/nemovitosti/${id}/naklady/${cost.id}`;
  const allocationByUnit = new Map(cost.allocations.map((row) => [row.unitId, row]));
  const allocatedAmountCents = cost.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  const allocatedShareBasisPoints = cost.allocations.reduce((sum, row) => sum + row.shareBasisPoints, 0);
  const allUnitsHaveArea = property.units.length > 0 && property.units.every((unit) => unit.areaM2 && unit.areaM2 > 0);
  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/finance`}>{property.name}</Link><span>›</span><span>{cost.title}</span></div>
    <div className="page-title"><div><h1>{cost.title}</h1><p>{propertyCostKinds[cost.kind]} · {propertyCostStatuses[cost.status]} · {date(cost.effectiveAt)}</p></div><Link className="secondary" href={`/nemovitosti/${id}/finance#naklady`}>Zpět na finance</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/>
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-5"><h2>Účetní kontext</h2><div className="summary-list"><div><span>Částka</span><strong>{money(cost.amountCents)}</strong></div><div><span>Kategorie</span><strong>{propertyCostCategories[cost.category]}</strong></div><div><span>Rozsah nákladu</span><strong>{propertyCostScopeLabel(cost)}</strong></div><div><span>Dodavatel</span><strong>{cost.vendor||"Neuveden"}</strong></div><div><span>Číslo dokladu</span><strong>{cost.documentNumber||"Neuvedeno"}</strong></div></div>{cost.note&&<p className="technical-note">{cost.note}</p>}</div>
      <div className="card col-7"><div className="card-head"><div><h2>Účetní podklady</h2><p className="muted-copy">Faktura, nabídka nebo jiný zdroj částky zůstává přímo u nákladu.</p></div></div>{canManage&&<DocumentUploadForm propertyId={id} unitId={cost.unitId||undefined} propertyCostId={cost.id} returnTo={returnTo} categories={[["INVOICE","Faktura"],["OFFER","Nabídka"],["OTHER","Jiný podklad"]]} title={cost.documentNumber?`${cost.title} · ${cost.documentNumber}`:cost.title}/>}<DocumentAttachments documents={cost.documents} canDelete={canManage} returnTo={returnTo}/></div>
      <div className="card col-12 cost-allocation-card" data-testid="cost-allocation"><div className="card-head"><div><h2>Rozdělení nákladu na jednotky</h2><p className="muted-copy">Určuje, jaká část nákladu vstoupí do ekonomiky konkrétních jednotek. Nemění celkovou částku ani účetní podklady.</p></div><span className={`status ${allocatedShareBasisPoints===10_000&&allocatedAmountCents===cost.amountCents?"ok":cost.allocations.length?"bad":""}`}>{cost.allocations.length?`${(allocatedShareBasisPoints/100).toLocaleString("cs-CZ")} % rozděleno`:"Bez rozdělení"}</span></div>
        {cost.allocations.length?<div className="table-wrap"><table><thead><tr><th>Jednotka</th><th>Výměra</th><th>Podíl</th><th>Částka</th></tr></thead><tbody>{cost.allocations.map((row)=><tr key={row.id}><td><Link className="entity-link" href={`/nemovitosti/${id}/jednotky/${row.unitId}`}>{row.unit.label}</Link></td><td>{row.unit.areaM2?`${row.unit.areaM2.toLocaleString("cs-CZ")} m²`:"Neuvedena"}</td><td>{(row.shareBasisPoints/100).toLocaleString("cs-CZ")} %</td><td><strong>{money(row.amountCents)}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Celkem</th><th>{(allocatedShareBasisPoints/100).toLocaleString("cs-CZ")} %</th><th>{money(allocatedAmountCents)}</th></tr></tfoot></table></div>:<div className="notice">Náklad je veden za celý objekt. Do výsledků jednotlivých jednotek zatím nevstupuje.</div>}
        {canManage&&<div className="cost-allocation-actions"><div className="cost-allocation-choice"><h3>Rychlé rozdělení celého domu</h3><p className="muted-copy">Použije všechny jednotky a přesně dorovná zaokrouhlení na celkovou částku.</p><form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="form-actions"><button className="secondary" type="submit" name="mode" value="equal">Rozdělit rovnoměrně</button><button className="secondary" type="submit" name="mode" value="area" disabled={!allUnitsHaveArea}>Rozdělit podle plochy</button></form>{!allUnitsHaveArea&&<small className="bad">Rozdělení podle plochy bude dostupné po doplnění výměry u všech jednotek.</small>}</div>
          <form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="cost-allocation-choice"><input type="hidden" name="mode" value="custom"/><div><h3>Vlastní podíly</h3><p className="muted-copy">Vyplňte pouze zahrnuté jednotky. Součet musí být přesně 100 %.</p></div><div className="cost-allocation-inputs">{property.units.map((unit)=>{const allocation=allocationByUnit.get(unit.id);return <label className="field" key={unit.id}><span>Jednotka {unit.label} (%)</span><input name={`share-${unit.id}`} type="number" min="0.01" max="100" step="0.01" defaultValue={allocation?allocation.shareBasisPoints/100:""} placeholder="0"/><small>{unit.areaM2?`${unit.areaM2.toLocaleString("cs-CZ")} m²`:"výměra neuvedena"}</small></label>})}</div><div className="form-actions"><button className="primary" type="submit">Uložit vlastní rozdělení</button></div></form>
          {(cost.allocations.length>0||cost.unitId)&&<form action={`/api/properties/${id}/costs/${cost.id}/allocations`} method="post" className="cost-allocation-clear"><input type="hidden" name="mode" value="clear"/><div><strong>Zrušit rozdělení na jednotky</strong><p className="muted-copy">Náklad se vrátí na celý objekt. Celková částka a přiložené podklady zůstanou zachované.</p></div><button className="secondary" type="submit">Vrátit na celý objekt</button></form>}
        </div>}
      </div>
    </div>
  </div></Shell>;
}
