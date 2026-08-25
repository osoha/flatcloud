import { currentUser } from "@/lib/auth";
import { syncInboundMailbox } from "@/lib/inbound-bank/sync";
import { hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", "Nemáte oprávnění kontrolovat bankovní schránku.");
  try { const result = await syncInboundMailbox(); return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", result.enabled ? (result.summary || "Sběrná schránka byla zkontrolována.") : "Sběrný e-mail není v administraci aktivní."); }
  catch(error){ return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", error instanceof Error ? error.message : "Schránku se nepodařilo zkontrolovat."); }
}
