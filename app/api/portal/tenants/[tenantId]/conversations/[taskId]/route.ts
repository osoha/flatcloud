import { after, NextResponse } from "next/server";
import { actualUser } from "@/lib/auth";
import { PortalConversationError, replyToTenantPortalConversation, tenantPortalConversation } from "@/lib/tenant-portal-conversations";
import { processTaskNotifications } from "@/lib/task-notifications";

export const dynamic = "force-dynamic";
const failure = (error: unknown) => NextResponse.json({ error: error instanceof PortalConversationError ? error.message : "Konverzaci se nepodařilo načíst nebo uložit. Zkuste to prosím znovu." }, { status: error instanceof PortalConversationError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string; taskId: string }> }) {
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo. Přihlaste se znovu." }, { status: 401 });
  const { tenantId, taskId } = await params;
  try {
    const conversation = await tenantPortalConversation(user, tenantId, taskId, new URL(request.url).searchParams.get("preview") === "1");
    return NextResponse.json({ conversation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string; taskId: string }> }) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Odeslání z jiné stránky není povoleno." }, { status: 403 });
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo. Přihlaste se znovu." }, { status: 401 });
  const { tenantId, taskId } = await params;
  try {
    if (new URL(request.url).searchParams.has("preview")) throw new PortalConversationError("Náhled slouží pouze k prohlížení.", 403);
    const form = await request.formData();
    const result = await replyToTenantPortalConversation(user, tenantId, taskId, { body: String(form.get("body") || ""), submissionKey: String(form.get("submissionKey") || "") });
    if (result.created) after(async () => { try { await processTaskNotifications({ taskId }); } catch { console.error("Portal task notification worker failed; queue retained."); } });
    return NextResponse.json({ ok: true, taskId, ...result }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
