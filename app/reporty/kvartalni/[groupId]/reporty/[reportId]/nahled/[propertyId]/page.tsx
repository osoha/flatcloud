import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { QuarterlyPropertyReportDocument } from "@/components/reporting/quarterly-property/QuarterlyPropertyReportDocument";
import { requireUser } from "@/lib/auth";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { loadQuarterlyPropertyPresentation, QuarterlyPropertyPresentationNotFound, QuarterlyPropertyPresentationTemplateMissing } from "@/lib/reporting/presentation/quarterly-property-presentation-data";

export const dynamic = "force-dynamic";

export default async function QuarterlyPropertyPreviewPage({ params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, user] = await Promise.all([params, requireUser()]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const editorHref = `/reporty/kvartalni/${groupId}/reporty/${reportId}?section=property&propertyId=${encodeURIComponent(propertyId)}`;
  try {
    const model = await loadQuarterlyPropertyPresentation({ groupId, reportId, propertyId });
    return <Shell user={user}><div className="qpr-preview-screen"><header className="qpr-preview-toolbar"><div><Link href={editorHref}>← Zpět do editoru</Link><h1>{model.property.name}</h1><p>Kvartální report · Q{model.report.quarter} {model.report.year} · šablona {model.template.name} v{model.template.version}</p></div><span>Náhled — není publikovaný dokument</span></header><QuarterlyPropertyReportDocument model={model}/></div></Shell>;
  } catch (error) {
    if (error instanceof QuarterlyPropertyPresentationNotFound) notFound();
    if (error instanceof QuarterlyPropertyPresentationTemplateMissing) return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href={editorHref}>← Zpět do editoru</Link></div><div className="card"><h1>Náhled reportu není dostupný</h1><p>Tomuto reportu není přiřazena šablona designu. Přiřaďte ji v přehledu reportu; náhled přiřazení sám nemění.</p></div></div></Shell>;
    throw error;
  }
}
