import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportDesignContentPreview, ReportDesignCoverPreview } from "@/components/reporting/ReportDesignTemplatePreview";
import { Flash } from "@/components/FormUi";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reportDesignTemplateConfigSchema } from "@/lib/reporting/design-template-schema";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = { COVER: "Titulní strana", OVERVIEW: "Přehled / komentář", TECHNICAL: "Technický stav", VALUATION: "Ocenění", TRENDS: "Trendy" };
export default async function ReportDesignTemplateVersionPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ versionId }, user, query] = await Promise.all([params, requireUser(), searchParams]); if (user.role !== "SUPER_ADMIN") redirect("/reporty");
  const version = await prisma.reportDesignTemplateVersion.findUnique({ where: { id: versionId }, include: { template: true, pages: { include: { backgroundAsset: { select: { id: true, mimeType: true, deletedAt: true } } }, orderBy: { role: "asc" } } } }); if (!version) notFound();
  const config = reportDesignTemplateConfigSchema.parse(version.config), editable = version.status === "DRAFT", action = `/api/report-design-templates/versions/${version.id}`;
  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href="/reporty/sablony">← Šablony</Link></div><div className="page-title"><div><h1>{version.template.name} · v{version.version}</h1><p>{version.template.code} · {version.template.type}</p><span className="status">{version.status}</span></div></div><Flash ok={query.ok} error={query.error}/>
    <div className="card"><div className="form-actions">{editable ? <form action={action} method="post"><button className="primary" name="action" value="activate">Aktivovat verzi</button></form> : <form action={action} method="post"><button className="secondary" name="action" value="clone">Klonovat do nové DRAFT</button></form>}</div></div>
    <div className="template-preview-grid"><section className="card"><h2>Titulní strana</h2><ReportDesignCoverPreview config={config}/></section><section className="card"><h2>Přehled / komentář</h2><ReportDesignContentPreview config={config} overview backgroundUrl={version.pages.find((page) => page.role === "OVERVIEW")?.backgroundMode === "ASSET" ? `/api/report-design-templates/versions/${version.id}/backgrounds/OVERVIEW/image?variant=preview` : undefined}/></section><section className="card"><h2>Obsahová stránka</h2><ReportDesignContentPreview config={config} backgroundUrl={version.pages.find((page) => page.role === "TECHNICAL")?.backgroundMode === "ASSET" ? `/api/report-design-templates/versions/${version.id}/backgrounds/TECHNICAL/image?variant=preview` : undefined}/></section></div>
    <div className="card"><h2>Pozadí stránek</h2><div className="template-page-list">{version.pages.map((page) => <section key={page.id}><div><strong>{labels[page.role]}</strong><span>{page.backgroundMode === "GENERATED" ? "GENERATED" : "VLASTNÍ POZADÍ"}</span>{page.backgroundAsset && <img src={`/api/report-design-templates/versions/${version.id}/backgrounds/${page.role}/image?variant=thumbnail`} alt=""/>}</div>{editable && <div className="template-page-actions"><form action={`/api/report-design-templates/versions/${version.id}/backgrounds/${page.role}/upload`} method="post" encType="multipart/form-data"><input type="file" name="file" accept="image/png,image/jpeg" required/><button className="secondary">Nahrát / nahradit</button></form><form action={action} method="post"><input type="hidden" name="role" value={page.role}/><button name="action" value="generated">Použít generované</button>{page.backgroundMode === "ASSET" && page.role !== "COVER" && <button name="action" value="apply-content">Použít pro všechny obsahové stránky</button>}</form></div>}</section>)}</div></div>
  </div></Shell>;
}
