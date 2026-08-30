import { requireUser } from "@/lib/auth";
import { boolValue, text } from "@/lib/forms";
import { reportingBackofficeErrorMessage, updateReportingGroup } from "@/lib/reporting/backoffice-access";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) { const [{ groupId }, user] = await Promise.all([params, requireUser()]); try { const form = await request.formData(); await updateReportingGroup(groupId, { name: text(form, "name", true)!, description: text(form, "description"), active: boolValue(form, "active") }, user); return goWithMessage(request, `/reporty/kvartalni/${groupId}`, "ok", "Skupina byla aktualizována."); } catch (error) { return goWithMessage(request, `/reporty/kvartalni/${groupId}`, "error", reportingBackofficeErrorMessage(error)); } }
