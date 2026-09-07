import { requireUser } from "@/lib/auth";
import { parseCzkToCents, text } from "@/lib/forms";
import { annualReportEditorialSchema } from "@/lib/reporting/annual-report-schema";
import { requireAnnualReportInGroup, updateAnnualReportEditorial } from "@/lib/reporting/annual-report-service";
import { annualWorkflowErrorMessage } from "@/lib/reporting/annual-workflow-route";
import { goWithMessage } from "@/lib/route-response";

const money = (form: FormData, key: string) => {
  const value = text(form, key);
  return value === null ? null : parseCzkToCents(value);
};
const count = (form: FormData, key: string) => {
  const value = text(form, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Invalid count.");
  return parsed;
};

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; reportId: string }> }) {
  const [{ groupId, reportId }, actor] = await Promise.all([params, requireUser()]);
  const workspace = `/reporty/vyrocni/${groupId}/reporty/${reportId}`;
  try {
    await requireAnnualReportInGroup(reportId, groupId);
    const form = await request.formData();
    const input = annualReportEditorialSchema.parse({
      founderLetter: text(form, "founderLetter"),
      executiveSummary: text(form, "executiveSummary"),
      investmentThesis: text(form, "investmentThesis"),
      valueCreationSummary: text(form, "valueCreationSummary"),
      outlook: text(form, "outlook"),
      grossAssetValueCents: money(form, "grossAssetValue"),
      netAssetValueCents: money(form, "netAssetValue"),
      debtCents: money(form, "debt"),
      targetPortfolioValueCents: money(form, "targetPortfolioValue"),
      realizedExitProceedsCents: money(form, "realizedExitProceeds"),
      plannedExitProceedsCents: money(form, "plannedExitProceeds"),
      issuedShares: count(form, "issuedShares"),
      treasuryShares: count(form, "treasuryShares"),
      sharePriceCents: money(form, "sharePrice"),
    });
    await updateAnnualReportEditorial(reportId, input, actor);
    return goWithMessage(request, workspace, "ok", "Korporátní a portfolio vrstva byla uložena.");
  } catch (error) {
    return goWithMessage(request, workspace, "error", annualWorkflowErrorMessage(error));
  }
}
