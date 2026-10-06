import {
  workflowActor,
  publishPacket,
  cancelPacket,
} from "@/lib/lease-actions/service";
import { guideOriginMatches } from "@/lib/guide-origin";
import { goWithMessage } from "@/lib/route-response";
import { prisma } from "@/lib/db";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ leaseId: string }> },
) {
  const { leaseId } = await params,
    path = `/smlouvy/${leaseId}/potvrzeni`;
  if (!guideOriginMatches(request))
    return new Response("Forbidden", { status: 403 });
  const actor = await workflowActor();
  if (!actor || actor.role === "TENANT")
    return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 24000)
    return new Response("Too large", { status: 413 });
  try {
    const form = await request.formData();
    if (form.get("mode") === "cancel") {
      const id = String(form.get("packetId") || "");
      if (!(await prisma.leaseActionPacket.count({ where: { id, leaseId } })))
        throw new Error("Úkon není u této smlouvy.");
      await cancelPacket(actor, id);
      return goWithMessage(
        request,
        path,
        "ok",
        "Úkon byl zrušen. Historie zůstává zachována.",
      );
    }
    await publishPacket(actor, leaseId, {
      kind: String(form.get("kind") || ""),
      title: String(form.get("title") || ""),
      body: String(form.get("body") || ""),
      documentId: String(form.get("documentId") || ""),
      staffSignerId: String(form.get("staffSignerId") || ""),
      authority: String(form.get("authority") || ""),
      dueDate: String(form.get("dueDate") || ""),
      confirmed: form.get("confirmed") === "on",
    });
    return goWithMessage(
      request,
      path,
      "ok",
      "Konkrétní úkon byl předán do portálu smluvních nájemců. E-mail se neodesílal.",
    );
  } catch (error) {
    return goWithMessage(
      request,
      path,
      "error",
      error instanceof Error ? error.message : "Úkon se nepodařilo předat.",
    );
  }
}
