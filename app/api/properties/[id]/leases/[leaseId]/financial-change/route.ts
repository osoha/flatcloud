import { applyLeaseFinancialChange } from "@/lib/lease-financial-change";
import { dateValue, moneyToCents, text, boolValue } from "@/lib/forms";
import { requireManagedProperty } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    if (!boolValue(form, "confirm")) throw new Error("Před uložením potvrďte, že jste zkontroloval/a částky, účinnost a dopad na předpisy.");
    await applyLeaseFinancialChange(access.user, id, leaseId, { rentCents: moneyToCents(form, "rent"), servicesCents: moneyToCents(form, "services"), effectiveFrom: dateValue(form, "effectiveFrom", true)!, reason: text(form, "reason", true)!, expectedFingerprint: text(form, "expectedFingerprint", true)! });
    return goWithMessage(request, `/smlouvy/${leaseId}`, "ok", "Budoucí změna nájemného a služeb byla potvrzena. Historické a uhrazené předpisy zůstaly beze změny.");
  } catch (error) {
    return goWithMessage(request, `/smlouvy/${leaseId}/finance/upravit`, "error", error instanceof Error ? error.message : "Finanční změnu se nepodařilo uložit.");
  }
}
