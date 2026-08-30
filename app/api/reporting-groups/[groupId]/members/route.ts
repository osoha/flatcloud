import { ReportingGroupPermission } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { addReportingGroupMember, ReportingBackofficeError, reportingBackofficeErrorMessage, reportingGroupPermissions } from "@/lib/reporting/backoffice-access";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) { const [{ groupId }, actor] = await Promise.all([params, requireUser()]); try { const form = await request.formData(), userId = text(form, "userId", true)!, raw = text(form, "permission", true)! as ReportingGroupPermission; if (!reportingGroupPermissions.includes(raw)) throw new ReportingBackofficeError("Neplatné reportingové oprávnění."); await addReportingGroupMember(groupId, userId, raw, actor); return goWithMessage(request, `/reporty/kvartalni/${groupId}`, "ok", "Člen byl přidán."); } catch (error) { return goWithMessage(request, `/reporty/kvartalni/${groupId}`, "error", reportingBackofficeErrorMessage(error)); } }
