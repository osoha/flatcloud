import { after } from "next/server";
import { currentUser } from "@/lib/auth";
import { reviewTenantContactRequest } from "@/lib/tenant-contact-requests";
import { goWithMessage } from "@/lib/route-response";
import { processTenantPortalNotifications } from "@/lib/tenant-portal-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, target = `/ukoly/${id}#zmena-kontaktu`;
  try {
    const user = await currentUser();
    if (!user || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Nemáte oprávnění vyřídit toto nahlášení.");
    const form = await request.formData();
    const result = await reviewTenantContactRequest(user, id, { decision: String(form.get("decision") || ""), revision: String(form.get("revision") || ""), reviewNote: String(form.get("reviewNote") || "") });
    after(async () => { try { await processTenantPortalNotifications({ taskId: id }); } catch { console.error("Contact request tenant notification worker failed; queue retained."); } });
    return goWithMessage(request, target, "ok", result.decision === "ACKNOWLEDGED" ? "Nahlášení bylo převzato k vyřízení. Nájemník uvidí zprávu v konverzaci." : "Nahlášení bylo zamítnuto s vysvětlením pro nájemníka.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Vyřízení se nezdařilo."); }
}
