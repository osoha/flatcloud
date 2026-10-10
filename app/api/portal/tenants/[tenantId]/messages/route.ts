import { actualUser } from "@/lib/auth";
import { serializableTransaction } from "@/lib/serializable";
import { portalAnnouncementAudience, portalMessageLease, portalTaskAudience } from "@/lib/tenant-portal-messages";
import { goWithMessage } from "@/lib/route-response";
import { checkSubscriptionWrite } from "@/lib/subscriptions/service";

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  let target = `/portal/najemnik/${tenantId}`;
  try {
    const user = await actualUser();
    if (!user || user.role === "SUPER_ADMIN" || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("V náhledu nelze zprávy potvrzovat.");
    const form = await request.formData();
    const leaseId = String(form.get("leaseId") || "");
    target += `#zpravy-${leaseId}`;
    const kind = String(form.get("kind") || ""), itemId = String(form.get("itemId") || ""), action = String(form.get("action") || "");
    const now = new Date();
    await serializableTransaction(async tx => {
      const lease = await portalMessageLease(user, tenantId, leaseId, false, tx);
      if (!lease) throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
      const subscription=await checkSubscriptionWrite(user,{propertyId:lease.unit.propertyId,unitId:lease.unitId},tx);
      if(!subscription.allowed)throw new Error(subscription.message||"Správa má dočasně pozastavené předplatné.");
      if (kind === "task" && ["read", "confirm"].includes(action)) {
        const task = await tx.task.findFirst({ where: { id: itemId, ...portalTaskAudience(tenantId, leaseId, { unitId: lease.unitId, propertyId: lease.unit.propertyId }) }, select: { status: true, tenantPortalPublishedAt: true } });
        if (!task || ["DONE", "CANCELLED"].includes(task.status)) throw new Error("Tento úkol už nelze potvrdit.");
        if (form.get("revision") !== task.tenantPortalPublishedAt?.toISOString()) throw new Error("Zadání se změnilo. Přečtěte si prosím jeho aktuální znění.");
        await tx.taskUserState.upsert({ where: { taskId_userId: { taskId: itemId, userId: user.id } }, create: { taskId: itemId, userId: user.id, lastReadAt: now, ...(action === "confirm" ? { tenantConfirmedAt: now } : {}) }, update: { lastReadAt: now, ...(action === "confirm" ? { tenantConfirmedAt: now } : {}) } });
      } else if (kind === "announcement" && ["read", "dismiss", "restore"].includes(action)) {
        const announcement = await tx.announcement.findFirst({ where: { id: itemId, ...portalAnnouncementAudience(leaseId, lease.unit.propertyId), startsAt: { lte: now }, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true, updatedAt: true } });
        if (!announcement) throw new Error("Oznámení už není dostupné.");
        if (form.get("revision") !== announcement.updatedAt.toISOString()) throw new Error("Oznámení se změnilo. Přečtěte si prosím jeho aktuální znění.");
        const data = action === "restore" ? { dismissedAt: null } : { readAt: now, ...(action === "dismiss" ? { dismissedAt: now } : {}) };
        await tx.announcementUserState.upsert({ where: { announcementId_userId: { announcementId: itemId, userId: user.id } }, create: { announcementId: itemId, userId: user.id, ...data }, update: data });
      } else throw new Error("Neplatná akce.");
      await tx.auditLog.create({ data: { userId: user.id, propertyId: lease.unit.propertyId, action: "TENANT_PORTAL_MESSAGE_STATE", entityType: kind === "task" ? "Task" : "Announcement", entityId: itemId, details: { tenantId, leaseId, action } } });
    });
    return goWithMessage(request, target, "ok", action === "confirm" ? "Děkujeme, přijetí úkolu bylo potvrzeno." : "Zpráva byla aktualizována.");
  } catch (error) {
    return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Změnu se nepodařilo uložit.");
  }
}
