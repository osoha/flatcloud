import { ReportDesignPageRole } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { quarterlyReportMediaImageResponse } from "@/lib/reporting/quarterly-report-media-image";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; role: string }> }) {
  const actor = await currentUser(); if (!actor) return new Response("Unauthorized", { status: 401 });
  const { groupId, reportId, role } = await params;
  if (!Object.values(ReportDesignPageRole).includes(role as ReportDesignPageRole)) return new Response("Template background was not found.", { status: 404 });
  if (!canReadReportingBackoffice(await backofficePermissionForGroup(actor, groupId))) return new Response("Forbidden", { status: 403 });
  const report = await prisma.quarterlyReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { designTemplateVersion: { select: { pages: { where: { role: role as ReportDesignPageRole, backgroundMode: "ASSET" }, select: { backgroundAsset: true }, take: 1 } } } } });
  const asset = report?.designTemplateVersion?.pages[0]?.backgroundAsset;
  if (!asset || asset.deletedAt || !asset.mimeType.startsWith("image/")) return new Response("Template background was not found.", { status: 404 });
  return quarterlyReportMediaImageResponse(request, asset);
}
