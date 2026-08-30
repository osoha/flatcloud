import { requireUser } from "@/lib/auth";
import { boolValue, text } from "@/lib/forms";
import { createReportingGroup, reportingBackofficeErrorMessage } from "@/lib/reporting/backoffice-access";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request) { const user = await requireUser(); try { const form = await request.formData(); const group = await createReportingGroup({ name: text(form, "name", true)!, description: text(form, "description"), active: boolValue(form, "active") }, user); return goWithMessage(request, `/reporty/kvartalni/${group.id}`, "ok", "Reportovací skupina byla vytvořena."); } catch (error) { return goWithMessage(request, "/reporty/kvartalni", "error", reportingBackofficeErrorMessage(error)); } }
