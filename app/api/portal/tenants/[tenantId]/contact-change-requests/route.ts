import { after, NextResponse } from "next/server";
import { actualUser } from "@/lib/auth";
import { createTenantContactRequest, tenantContactRequests } from "@/lib/tenant-contact-requests";
import { collectTaskNotifications, processTaskNotifications } from "@/lib/task-notifications";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await actualUser();
  if (!user) return NextResponse.json({ error: "Přihlaste se do svého portálu nájemníka." }, { status: 403, headers: privateHeaders });
  try {
    const { tenantId } = await params, query = new URL(request.url).searchParams, leaseId = query.get("leaseId") || "";
    return NextResponse.json(await tenantContactRequests(user, tenantId, leaseId, query.get("preview") === "1"), { headers: privateHeaders });
  } catch { return NextResponse.json({ error: "K tomuto nájemnímu vztahu nemáte přístup." }, { status: 403, headers: privateHeaders }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await actualUser();
  if (!user || user.role === "SUPER_ADMIN" || new URL(request.url).searchParams.has("preview") || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Tato akce není dostupná." }, { status: 403, headers: privateHeaders });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Neplatný formát požadavku." }, { status: 415, headers: privateHeaders });
  try {
    const { tenantId } = await params, input: unknown = await request.json();
    const leaseId = input && typeof input === "object" && "leaseId" in input && typeof input.leaseId === "string" ? input.leaseId : "";
    const result = await createTenantContactRequest(user, tenantId, leaseId, input);
    after(async () => { try { await collectTaskNotifications(); await processTaskNotifications({ taskId: result.taskId }); } catch { console.error("Contact request staff notification worker failed; queue retained."); } });
    return NextResponse.json({ request: result }, { status: 201, headers: privateHeaders });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Změnu se nepodařilo nahlásit." }, { status: 400, headers: privateHeaders }); }
}
