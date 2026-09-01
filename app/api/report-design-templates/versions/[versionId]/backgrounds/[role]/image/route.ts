import { ReportDesignPageRole } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { resolveTemplateBackground } from "@/lib/reporting/design-template-service";
import { quarterlyReportMediaImageResponse } from "@/lib/reporting/quarterly-report-media-image";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string; role: string }> }) {
  const actor = await currentUser(); if (!actor) return new Response("Unauthorized", { status: 401 });
  try {
    const { versionId, role } = await params;
    if (!Object.values(ReportDesignPageRole).includes(role as ReportDesignPageRole)) throw new Error();
    return quarterlyReportMediaImageResponse(request, await resolveTemplateBackground(versionId, role as ReportDesignPageRole, actor));
  } catch { return new Response("Template background was not found.", { status: 404 }); }
}
