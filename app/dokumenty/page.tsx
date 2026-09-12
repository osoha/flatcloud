import Link from "next/link";
import { DocumentCategory, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentAccessWhere } from "@/lib/documents/access";
import { Shell } from "@/components/Shell";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";
import { businessDateEndInstant, businessDateKeyToInstant, type BusinessDateKey } from "@/lib/calendar";
import { documentCategories } from "@/lib/labels";

export const dynamic = "force-dynamic";
type Query = { q?: string; property?: string; category?: string; type?: string; dateFrom?: string; dateTo?: string; page?: string };
const validDate = (value?: string): value is BusinessDateKey => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));

export function cleanDocumentCatalogParams(query: Query, page: number) {
  const params = new URLSearchParams();
  for (const key of ["q", "property", "category", "type", "dateFrom", "dateTo"] as const) if (query[key]) params.set(key, query[key]!);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
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

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><h1>Dokumenty</h1><p>Soukromý katalog smluv, protokolů, fotografií a příloh, ke kterým máte přístup.</p></div></div>
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
