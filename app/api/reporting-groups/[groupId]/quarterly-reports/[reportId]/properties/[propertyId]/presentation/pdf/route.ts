import { currentUser } from "@/lib/auth";
import { renderQuarterlyPropertyLandscapePdfPreview, QuarterlyPropertyPdfPreviewError } from "@/lib/reporting/presentation/pdf/quarterly-property-pdf-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const actor = await currentUser();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId, propertyId } = await params;
  try {
    const preview = await renderQuarterlyPropertyLandscapePdfPreview({ groupId, reportId, propertyId, actor });
    return new Response(preview.bytes, { headers: { "Content-Type": preview.mimeType, "Content-Disposition": `inline; filename="${preview.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof QuarterlyPropertyPdfPreviewError) return new Response(error.message, { status: error.status });
    console.error("Quarterly property PDF preview failed.", error instanceof Error ? error.name : "Unknown error");
    return new Response("Quarterly property PDF preview failed.", { status: 500 });
  }
}
