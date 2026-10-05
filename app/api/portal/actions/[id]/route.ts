import { NextResponse } from "next/server";
import {
  workflowActor,
  accessiblePacket,
  completePacket,
  packetFile,
} from "@/lib/lease-actions/service";
import { actionEvidencePdf } from "@/lib/lease-actions/pdf";
import { guideOriginMatches } from "@/lib/guide-origin";
import { goWithMessage } from "@/lib/route-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await workflowActor();
  if (!actor) return new Response("Forbidden", { status: 403 });
  const packet = await accessiblePacket(actor, (await params).id);
  if (!packet) return new Response("Not found", { status: 404 });
  try {
    const original = new URL(request.url).searchParams.get("original") === "1",
      bytes = original
        ? await packetFile(packet)
        : await actionEvidencePdf(packet);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename=${original ? "dokument" : "dokument-a-potvrzeni"}.pdf`,
      },
    });
  } catch {
    return new Response("Dokument není dostupný v potvrzované verzi.", {
      status: 409,
    });
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    path = `/portal/najemnik/potvrzeni/${id}`;
  if (!guideOriginMatches(request))
    return NextResponse.json(
      { error: "Neplatný původ požadavku." },
      { status: 403 },
    );
  const actor = await workflowActor();
  if (!actor) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 8000)
    return new Response("Too large", { status: 413 });
  try {
    const form = await request.formData();
    await completePacket(actor, id, {
      contentHash: String(form.get("contentHash") || ""),
      password: String(form.get("password") || ""),
      accepted: form.get("accepted") === "on",
    });
    return goWithMessage(
      request,
      path,
      "ok",
      "Váš úkon a přesná verze dokumentu byly zaznamenány.",
    );
  } catch (error) {
    return goWithMessage(
      request,
      path,
      "error",
      error instanceof Error ? error.message : "Úkon se nepodařilo uložit.",
    );
  }
}
