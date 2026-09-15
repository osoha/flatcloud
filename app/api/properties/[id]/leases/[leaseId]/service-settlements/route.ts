import { requireUser } from "@/lib/auth";
import { boolValue, text } from "@/lib/forms";
import { issueServiceSettlementProtocol } from "@/lib/service-settlement-protocols";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const user = await requireUser(), { id, leaseId } = await params;
  let from = "", to = "";
  try {
    const form = await request.formData();
    from = text(form, "from", true)!; to = text(form, "to", true)!;
    if (!boolValue(form, "confirm")) throw new Error("Před vystavením potvrďte kontrolu podkladů a výsledku.");
    const protocol = await issueServiceSettlementProtocol(user, leaseId, { from, to, propertyId: id });
    return goWithMessage(request, `/smlouvy/${leaseId}/vyuctovani/${protocol.id}`, "ok", "Pracovní protokol byl uložen. Předpisy, kredity a platby se nezměnily.");
  } catch (error) {
    const period = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
    return goWithMessage(request, `/smlouvy/${leaseId}/vyuctovani${period}`, "error", error instanceof Error ? error.message : "Protokol se nepodařilo vystavit.");
  }
}
