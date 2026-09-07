import { requireUser } from "@/lib/auth";
import { parseCzkToCents, text } from "@/lib/forms";
import { annualPropertyEditorialSchema } from "@/lib/reporting/annual-report-schema";
import { requireAnnualReportInGroup, updateAnnualPropertyEditorial } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

const money = (form: FormData, key: string) => {
  const value = text(form, key);
  return value === null ? null : parseCzkToCents(value);
};

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string; propertyId: string }> }) {
  const [{ groupId, reportId, propertyId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}?section=property&propertyId=${propertyId}`;
  try {
    await requireAnnualReportInGroup(reportId, groupId);
    const form = await request.formData();
    const exitYearValue = text(form, "plannedExitYear");
    const input = annualPropertyEditorialSchema.parse({
      openingValueCents: money(form, "openingValue"),
      currentValueCents: money(form, "currentValue"),
      targetValueCents: money(form, "targetValue"),
      realizedExitProceedsCents: money(form, "realizedExitProceeds"),
      plannedExitProceedsCents: money(form, "plannedExitProceeds"),
      plannedExitYear: exitYearValue === null ? null : Number(exitYearValue),
      investmentCase: text(form, "investmentCase"),
      valueCreationNarrative: text(form, "valueCreationNarrative"),
      outlook: text(form, "outlook"),
      sourceNote: text(form, "sourceNote"),
    });
    await updateAnnualPropertyEditorial(reportId, propertyId, input, actor);
    return goWithMessage(request, workspace, "ok", "Kapitola nemovitosti byla uložena.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error));
  }
}
