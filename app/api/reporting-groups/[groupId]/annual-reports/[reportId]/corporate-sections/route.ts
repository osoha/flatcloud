import { requireUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { annualContactSchema, annualGroupStructureSchema, annualTeamSchema } from "@/lib/reporting/annual-corporate-sections";
import { requireAnnualReportInGroup, updateAnnualCorporateSections } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

const rows = (form: FormData, prefix: string, count: number, fields: string[]) => Array.from({ length: count }, (_, index) => Object.fromEntries(fields.map((field) => [field, text(form, `${prefix}.${index}.${field}`) || ""]))).filter((row) => row.name);

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=corporate`;
  try {
    await requireAnnualReportInGroup(reportId, groupId); const form = await request.formData();
    const team = annualTeamSchema.parse(rows(form, "team", 8, ["name", "role", "email", "sourceUserId"]).map((row) => ({ ...row, sourceUserId: row.sourceUserId || null, photoDataUrl: null })));
    const entities = rows(form, "entity", 8, ["name", "type", "ico", "address", "leadership"]);
    const structure = annualGroupStructureSchema.parse({ parent: { name: text(form, "parent.name"), type: text(form, "parent.type") || "", ico: text(form, "parent.ico") || "", address: text(form, "parent.address") || "", leadership: text(form, "parent.leadership") || "" }, subsidiaries: entities });
    const contact = annualContactSchema.parse({ companyName: text(form, "companyName"), registeredAddress: text(form, "registeredAddress") || "", officeAddress: text(form, "officeAddress") || "", phone: text(form, "phone") || "", email: text(form, "email") || "", dataBox: text(form, "dataBox") || "", boardMembers: text(form, "boardMembers") || "", investmentCommittee: text(form, "investmentCommittee") || "", confidentialityNotice: text(form, "confidentialityNotice"), investmentDisclaimer: text(form, "investmentDisclaimer") });
    await updateAnnualCorporateSections(reportId, { team, structure, contact }, actor);
    return goWithMessage(request, workspace, "ok", "Tým, struktura skupiny a kontakty byly uloženy.");
  } catch (error) { return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error)); }
}
