import Link from "next/link";
import { notFound } from "next/navigation";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { documentAccessWhere } from "@/lib/documents/access";
import { propertyCostCategories, propertyCostKinds, propertyCostStatuses } from "@/lib/asset-finance";
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
      documents: {
        where: documentAccessWhere(user),
        orderBy: { createdAt: "desc" },
        include: { fileAsset: true, property: { select: { name: true } }, unit: { select: { label: true } }, propertyCost: { select: { title: true } } },
      },
    },
  });
  if (!cost) notFound();
  const returnTo = `/nemovitosti/${id}/naklady/${cost.id}`;
  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><Link href={`/nemovitosti/${id}/finance`}>{property.name}</Link><span>›</span><span>{cost.title}</span></div>
    <div className="page-title"><div><h1>{cost.title}</h1><p>{propertyCostKinds[cost.kind]} · {propertyCostStatuses[cost.status]} · {date(cost.effectiveAt)}</p></div><Link className="secondary" href={`/nemovitosti/${id}/finance#naklady`}>Zpět na finance</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/>
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-5"><h2>Účetní kontext</h2><div className="summary-list"><div><span>Částka</span><strong>{money(cost.amountCents)}</strong></div><div><span>Kategorie</span><strong>{propertyCostCategories[cost.category]}</strong></div><div><span>Rozsah nákladu</span><strong>{cost.unit?`Jednotka ${cost.unit.label}`:"Celý objekt"}</strong></div><div><span>Dodavatel</span><strong>{cost.vendor||"Neuveden"}</strong></div><div><span>Číslo dokladu</span><strong>{cost.documentNumber||"Neuvedeno"}</strong></div></div>{cost.note&&<p className="technical-note">{cost.note}</p>}</div>
      <div className="card col-7"><div className="card-head"><div><h2>Účetní podklady</h2><p className="muted-copy">Faktura, nabídka nebo jiný zdroj částky zůstává přímo u nákladu.</p></div></div>{canManage&&<DocumentUploadForm propertyId={id} unitId={cost.unitId||undefined} propertyCostId={cost.id} returnTo={returnTo} categories={[["INVOICE","Faktura"],["OFFER","Nabídka"],["OTHER","Jiný podklad"]]} title={cost.documentNumber?`${cost.title} · ${cost.documentNumber}`:cost.title}/>}<DocumentAttachments documents={cost.documents} canDelete={canManage} returnTo={returnTo}/></div>
    </div>
  </div></Shell>;
}
