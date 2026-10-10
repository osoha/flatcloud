import {currentUser} from "@/lib/auth";
import {guideOriginMatches} from "@/lib/guide-origin";
import {goWithMessage, safeInternalReturnPath} from "@/lib/route-response";
import {serializableTransaction} from "@/lib/serializable";
import {updateDocumentMetadata} from "@/lib/documents/metadata";

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const user = await currentUser();
  if (!user || user.role === "TENANT" || request.headers.get("sec-fetch-site") === "cross-site" || !guideOriginMatches(request)) return new Response("Nemáte oprávnění.", {status: 403});
  const {id} = await params;
  let target = "/dokumenty";
  try {
    const form = await request.formData();
    target = safeInternalReturnPath(form.get("returnTo"), target);
    const result = await serializableTransaction(tx => updateDocumentMetadata(tx, user, id, {title: String(form.get("title") || ""), category: String(form.get("category") || ""), leaseId: String(form.get("leaseId") || "").trim() || null}));
    return goWithMessage(request, target, "ok", result.reassigned ? "Zařazení dokumentu bylo uloženo. Po změně smlouvy je dokument pouze pro správu; sdílení nájemníkovi zapněte samostatně." : "Zařazení dokumentu bylo uloženo.");
  } catch (error) {return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Zařazení dokumentu se nepodařilo uložit.");}
}
