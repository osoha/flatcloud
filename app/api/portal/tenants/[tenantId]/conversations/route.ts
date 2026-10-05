import { after, NextResponse } from "next/server";
import { actualUser } from "@/lib/auth";
import { createTenantPortalConversation, PortalConversationError, tenantPortalConversations } from "@/lib/tenant-portal-conversations";
import { collectTaskNotifications, processTaskNotifications } from "@/lib/task-notifications";

export const dynamic = "force-dynamic";
const failure = (error: unknown) => NextResponse.json({ error: error instanceof PortalConversationError ? error.message : "Zprávu se nepodařilo uložit. Zkuste to prosím znovu." }, { status: error instanceof PortalConversationError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo. Přihlaste se znovu." }, { status: 401 });
  const { tenantId } = await params, url = new URL(request.url);
  try {
    const conversations = await tenantPortalConversations(user, tenantId, url.searchParams.get("leaseId") || "", url.searchParams.get("preview") === "1");
    return NextResponse.json({ conversations }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Odeslání z jiné stránky není povoleno." }, { status: 403 });
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlášení vypršelo. Přihlaste se znovu." }, { status: 401 });
  const { tenantId } = await params;
  try {
    if (new URL(request.url).searchParams.has("preview")) throw new PortalConversationError("Náhled slouží pouze k prohlížení.", 403);
    const form = await request.formData();
    if (form.get("kind") && form.get("kind") !== "MESSAGE") throw new PortalConversationError("Pro tento požadavek použijte příslušný formulář.");
    const result = await createTenantPortalConversation(user, tenantId, { leaseId: String(form.get("leaseId") || ""), title: String(form.get("title") || ""), body: String(form.get("body") || ""), submissionKey: String(form.get("submissionKey") || "") });
    if (result.created) after(async () => { try { await collectTaskNotifications(); await processTaskNotifications({ taskId: result.taskId }); } catch { console.error("Portal task notification worker failed; queue retained."); } });
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
