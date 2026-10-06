import {
  workflowActor,
  savePersonalSignature,
  signatureImage,
} from "@/lib/lease-actions/service";
import { prisma } from "@/lib/db";
import { guideOriginMatches } from "@/lib/guide-origin";
import { goWithMessage } from "@/lib/route-response";
export const runtime = "nodejs";
export async function GET() {
  const actor = await workflowActor();
  if (!actor) return new Response("Forbidden", { status: 403 });
  const p = await prisma.contractSignatureProfile.findUnique({
    where: { userId: actor.id },
  });
  return p
    ? new Response(new Uint8Array(signatureImage(p.encryptedImage)), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
        },
      })
    : new Response("Not found", { status: 404 });
}
export async function POST(request: Request) {
  if (!guideOriginMatches(request))
    return new Response("Forbidden", { status: 403 });
  const actor = await workflowActor();
  if (!actor) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 1600000)
    return new Response("Too large", { status: 413 });
  let destination = "/portal/najemnik/podpis";
  try {
    const form = await request.formData();
    if (form.get("returnTo") === "account" && actor.role === "TENANT")
      destination = "/portal/najemnik/ucet#podpis";
    if (form.get("ownSignature") !== "on")
      throw new Error("Potvrďte, že ukládáte vlastní podpis.");
    await savePersonalSignature(
      actor,
      String(form.get("drawnSignature") || ""),
      String(form.get("password") || ""),
    );
    return goWithMessage(
      request,
      destination,
      "ok",
      "Váš podpis byl uložen. Pro každý dokument jej použijete až výslovným potvrzením.",
    );
  } catch (error) {
    return goWithMessage(
      request,
      destination,
      "error",
      error instanceof Error ? error.message : "Podpis se nepodařilo uložit.",
    );
  }
}
