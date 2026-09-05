import { requireUser } from "@/lib/auth";
import { boolValue, dateValue, text } from "@/lib/forms";
import { issueServiceSettlementProtocol } from "@/lib/service-settlement-protocols";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const user = await requireUser(), { leaseId } = await params;
  let from = "", to = "";
  try {
    const form = await request.formData();
    from = text(form, "from", true)!; to = text(form, "to", true)!;
    if (!boolValue(form, "confirm")) throw new Error("Před vystavením potvrďte kontrolu podkladů a výsledku.");
    const protocol = await issueServiceSettlementProtocol(user, leaseId, { from, to, dueDate: dateValue(form, "dueDate") });
    return goWithMessage(request, `/smlouvy/${leaseId}/vyuctovani/${protocol.id}`, "ok", "Protokol byl vystaven a návazný nedoplatek nebo přeplatek byl zaúčtován.");
  } catch (error) {
    const period = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
    return goWithMessage(request, `/smlouvy/${leaseId}/vyuctovani${period}`, "error", error instanceof Error ? error.message : "Protokol se nepodařilo vystavit.");
  }
}
