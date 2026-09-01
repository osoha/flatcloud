import type { ReportingBackofficeActor } from "@/lib/reporting/backoffice-access";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { loadQuarterlyPropertyPresentation, QuarterlyPropertyPresentationNotFound, QuarterlyPropertyPresentationTemplateMissing } from "../quarterly-property-presentation-data";
import { resolveQuarterlyPropertyPdfAssets, QuarterlyPropertyPdfAssetUnavailable } from "./quarterly-property-pdf-assets";
import { renderQuarterlyPropertyLandscapePdf } from "./QuarterlyPropertyLandscapePdfDocument";

export class QuarterlyPropertyPdfPreviewError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "QuarterlyPropertyPdfPreviewError"; }
}

export function quarterlyPropertyPdfPreviewFilename(propertyName: string, quarter: number, year: number) {
  const slug = propertyName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "nemovitost";
  return `flatcloud-${slug}-q${quarter}-${year}-nahled.pdf`;
}

export async function renderQuarterlyPropertyLandscapePdfPreview(input: { groupId: string; reportId: string; propertyId: string; actor: ReportingBackofficeActor }) {
  if (!canReadReportingBackoffice(await backofficePermissionForGroup(input.actor, input.groupId))) throw new QuarterlyPropertyPdfPreviewError("Forbidden", 403);
  try {
    const model = await loadQuarterlyPropertyPresentation(input);
    const assets = await resolveQuarterlyPropertyPdfAssets(input);
    const bytes = await renderQuarterlyPropertyLandscapePdf(model, assets);
    return { bytes, mimeType: "application/pdf" as const, filename: quarterlyPropertyPdfPreviewFilename(model.property.name, model.report.quarter, model.report.year) };
  } catch (error) {
    if (error instanceof QuarterlyPropertyPresentationNotFound) throw new QuarterlyPropertyPdfPreviewError("Report property was not found.", 404);
    if (error instanceof QuarterlyPropertyPresentationTemplateMissing) throw new QuarterlyPropertyPdfPreviewError("Report template is unavailable.", 409);
    if (error instanceof QuarterlyPropertyPdfAssetUnavailable) throw new QuarterlyPropertyPdfPreviewError("A required report asset is temporarily unavailable.", 503);
    throw error;
  }
}
