import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";

export async function GET(_: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]); const permission = await backofficePermissionForGroup(actor, groupId); if (!canReadReportingBackoffice(permission)) return new Response("Forbidden", { status: 403 });
  const row = await prisma.annualPropertyReport.findFirst({ where: { annualReportId: reportId, propertyId, annualReport: { reportingGroupId: groupId } }, select: { mapPhotoData: true, mapPhotoMimeType: true } });
  if (!row?.mapPhotoData || !row.mapPhotoMimeType) return new Response("Not found", { status: 404 });
  return new Response(row.mapPhotoData, { headers: { "content-type": row.mapPhotoMimeType, "cache-control": "private, max-age=300" } });
}
