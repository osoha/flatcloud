import { requireReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { requireUser } from "@/lib/auth";
import { floatValue, text } from "@/lib/forms";
import { prisma } from "@/lib/db";
import { geocodeCzechAddress } from "@/lib/reporting/annual-map";
import { requireAnnualReportInGroup, updateAnnualMapEntries } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

const optionalNumber = (form: FormData, key: string) => floatValue(form, key);
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]); const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=map`;
  let mode = "save";
  try {
    await requireAnnualReportInGroup(reportId, groupId); const form = await request.formData(); mode = text(form, "mode") || "save";
    await requireReportingBackoffice(actor, groupId, "EDIT");
    const report = await prisma.annualReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { propertyReports: { select: { propertyId: true, propertyAddressSnapshot: true, mapLatitude: true, mapLongitude: true, mapLabel: true, mapCardSide: true }, orderBy: { propertyNameSnapshot: "asc" } } } });
    if (!report) throw new Error("Annual report was not found.");
    const entries = [];
    const proposals = [];
    let coordinatesChanged = false;
    for (let index = 0; index < report.propertyReports.length; index += 1) {
      const row = report.propertyReports[index]; let latitude = optionalNumber(form, `property.${index}.latitude`); let longitude = optionalNumber(form, `property.${index}.longitude`);
      if (mode === "geocode" && (latitude === null || longitude === null)) { const hit = await geocodeCzechAddress(row.propertyAddressSnapshot); if (hit) proposals.push({ propertyId: row.propertyId, index, address: row.propertyAddressSnapshot, ...hit }); if (index < report.propertyReports.length - 1) await new Promise((resolve) => setTimeout(resolve, 1_050)); }
      coordinatesChanged ||= latitude !== row.mapLatitude || longitude !== row.mapLongitude;
      entries.push({ propertyId: row.propertyId, latitude, longitude, label: text(form, `property.${index}.label`), cardSide: text(form, `property.${index}.cardSide`) || "AUTO" });
    }
    if (mode === "geocode") return Response.json({ proposals });
    if (coordinatesChanged && text(form, "confirmCoordinates") !== "1") throw new Error("Změnu polohy potvrďte až po kontrole souřadnic.");
    await updateAnnualMapEntries(reportId, entries, actor);
    return goWithMessage(request, workspace, "ok", "Mapa portfolia byla uložena.");
  } catch (error) { if (mode === "geocode") return Response.json({ error: "Návrhy poloh nejsou dostupné. Zkontrolujte oprávnění a zkuste to znovu." }, { status: 400 }); return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error)); }
}
