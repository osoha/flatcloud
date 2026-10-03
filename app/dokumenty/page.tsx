import { cleanDocumentCatalogParams } from "@/lib/documents/catalog";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { DocumentCategory, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentAccessWhere } from "@/lib/documents/access";
import { Shell } from "@/components/Shell";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { businessDateEndInstant, businessDateKeyToInstant, type BusinessDateKey } from "@/lib/calendar";
import { documentCategories } from "@/lib/labels";
import { displayMode } from "@/lib/display-mode";
import { BasicSectionHero, BasicSectionStat } from "@/components/BasicSection";
import { EntityAvatar } from "@/components/EntityAvatar";
import { loadEntityPhotos } from "@/lib/entity-photos";

export const dynamic = "force-dynamic";
type Query = { q?: string; property?: string; category?: string; type?: string; dateFrom?: string; dateTo?: string; page?: string };
const validDate = (value?: string): value is BusinessDateKey => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const basic = await displayMode(user.id, user.onboardingStatus === "pending" || user.defaultDisplayMode === "basic" ? "basic" : "pro") === "basic";
  const q = await searchParams;
  const page = Math.max(1, Number(q.page) || 1);
  const dateFrom = validDate(q.dateFrom) ? businessDateKeyToInstant(q.dateFrom) : undefined;
  const dateTo = validDate(q.dateTo) ? businessDateEndInstant(q.dateTo) : undefined;
  const filters: Prisma.DocumentWhereInput = {
    ...documentAccessWhere(user),
    ...(q.property ? { propertyId: q.property } : {}),
    ...(q.category && Object.values(DocumentCategory).includes(q.category as DocumentCategory) ? { category: q.category as DocumentCategory } : {}),
    ...(q.type ? { fileAsset: { mimeType: { startsWith: q.type === "image" ? "image/" : q.type } } } : {}),
    ...(dateFrom || dateTo ? { documentDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }, { fileAsset: { originalName: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  const include = { fileAsset: true, property: { select: { name: true } }, unit: { select: { label: true } }, lease: { select: { contractNumber: true } }, task: { select: { title: true } }, complianceRecord: { select: { id: true, complianceItem: { select: { name: true } } } }, propertyCost: { select: { title: true } } } as const;
  const [documents, total, properties] = await Promise.all([
    prisma.document.findMany({ where: filters, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include }),
    prisma.document.count({ where: filters }),
    prisma.property.findMany({ where: { documents: { some: documentAccessWhere(user) } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 50));
  const filtered = Boolean(q.q || q.property || q.category || q.type || q.dateFrom || q.dateTo);
  const photos = basic ? await loadEntityPhotos(user, properties.map(property=>property.id)) : null;

  if(basic) return <Shell user={user}><div className="page basic-section-page"><BasicSectionHero eyebrow="Vaše soubory" title="Dokumenty" description="Smlouvy, protokoly a další dostupné soubory podle nemovitosti." berry="contracts" message={total?`${total} ${total===1?"dokument":"dokumentů"} odpovídá zvolenému výběru.`:"Zatím tu nejsou žádné dokumenty pro tento výběr."}/>
    <div className="basic-section-stats"><BasicSectionStat label="Nalezené dokumenty" value={String(total)} detail="v aktuálním výběru"/><BasicSectionStat label="Nemovitosti" value={String(properties.length)} detail="s přístupnými dokumenty" tone="green"/><BasicSectionStat label="Na této stránce" value={String(documents.length)} detail={`strana ${page} z ${pages}`} tone="amber"/></div>
    <details className="card basic-section-filter" open={filtered}><summary>Hledat a filtrovat</summary><form className="filter-row document-filter-row" method="get" aria-label="Filtry katalogu dokumentů"><label className="field document-search-field"><span>Hledat</span><input name="q" defaultValue={q.q} placeholder="Název nebo soubor"/></label><label className="field"><span>Nemovitost</span><select name="property" defaultValue={q.property||""}><option value="">Všechny nemovitosti</option>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label className="field"><span>Kategorie</span><select name="category" defaultValue={q.category||""}><option value="">Všechny kategorie</option>{Object.values(DocumentCategory).map(category=><option key={category} value={category}>{documentCategories[category]||category}</option>)}</select></label><label className="field"><span>Typ souboru</span><select name="type" defaultValue={q.type||""}><option value="">Všechny typy</option><option value="image">Fotografie</option><option value="application/pdf">PDF</option></select></label><label className="field"><span>Datum od</span><input type="date" name="dateFrom" defaultValue={q.dateFrom}/></label><label className="field"><span>Datum do</span><input type="date" name="dateTo" defaultValue={q.dateTo}/></label><div className="document-filter-actions"><button className="secondary">Filtrovat</button>{filtered&&<Link className="text-button" href="/dokumenty">Zrušit filtry</Link>}</div></form></details>
    {!filtered&&properties.length>0&&<><div className="basic-section-heading"><h2>Podle nemovitosti</h2></div><div className="basic-section-property-grid">{properties.map(property=><Link className="basic-section-property" key={property.id} href={`/dokumenty?property=${encodeURIComponent(property.id)}`}><EntityAvatar photoId={photos?.properties[property.id]} identity={property.id} size="lg"/><div><strong>{property.name}</strong><small>Otevřít dokumenty →</small></div></Link>)}</div></>}
    <div className="basic-section-heading"><h2>{filtered?"Výsledky hledání":"Nedávné dokumenty"}</h2></div><div className="card"><DocumentAttachments documents={documents} showContext/>{total>50&&<div className="pagination"><Link href={`?${cleanDocumentCatalogParams(q,Math.max(1,page-1))}`}>Předchozí</Link><span>{page} / {pages}</span><Link href={`?${cleanDocumentCatalogParams(q,Math.min(pages,page+1))}`}>Další</Link></div>}</div>
  </div></Shell>;

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><PageHeading>Dokumenty</PageHeading><p>Soukromý katalog smluv, protokolů, fotografií a příloh, ke kterým máte přístup.</p></div></div>
    <form className="card filter-row document-filter-row" method="get" aria-label="Filtry katalogu dokumentů">
      <label className="field document-search-field"><span>Hledat</span><input name="q" defaultValue={q.q} placeholder="Název nebo soubor"/></label>
      <label className="field"><span>Nemovitost</span><select name="property" defaultValue={q.property || ""}><option value="">Všechny nemovitosti</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label className="field"><span>Kategorie</span><select name="category" defaultValue={q.category || ""}><option value="">Všechny kategorie</option>{Object.values(DocumentCategory).map((category) => <option key={category} value={category}>{documentCategories[category] || category}</option>)}</select></label>
      <label className="field"><span>Typ souboru</span><select name="type" defaultValue={q.type || ""}><option value="">Všechny typy</option><option value="image">Fotografie</option><option value="application/pdf">PDF</option></select></label>
      <label className="field"><span>Datum dokumentu od</span><input type="date" name="dateFrom" defaultValue={q.dateFrom}/></label>
      <label className="field"><span>Datum dokumentu do</span><input type="date" name="dateTo" defaultValue={q.dateTo}/></label>
      <div className="document-filter-actions"><button className="secondary">Filtrovat</button>{filtered && <Link className="text-button" href="/dokumenty">Zrušit filtry</Link>}</div>
    </form>
    <div className="card"><div className="card-head"><h2>Nalezené dokumenty</h2><span>{total}</span></div><DocumentAttachments documents={documents} showContext/>{total > 50 && <div className="pagination"><Link href={`?${cleanDocumentCatalogParams(q, Math.max(1, page - 1))}`}>Předchozí</Link><span>{page} / {pages}</span><Link href={`?${cleanDocumentCatalogParams(q, Math.min(pages, page + 1))}`}>Další</Link></div>}</div>
  </div></Shell>;
}
