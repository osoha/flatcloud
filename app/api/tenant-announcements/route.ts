import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canPublishLeaseMessage, canPublishPropertyMessage } from "@/lib/tenant-portal-messages";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { businessDateKey, businessDateKeyToInstant, businessDateEndInstant, type BusinessDateKey } from "@/lib/calendar";
import { goWithMessage } from "@/lib/route-response";
import type { AnnouncementSeverity } from "@prisma/client";

function inputDate(value: FormDataEntryValue | null, end = false) {
  if (!value) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Neplatné datum.");
  const parsed = businessDateKeyToInstant(value as BusinessDateKey);
  if (businessDateKey(parsed) !== value) throw new Error("Neplatné datum.");
  return end ? businessDateEndInstant(value as BusinessDateKey) : parsed;
}

export async function POST(request: Request) {
  const target = "/ukoly/oznameni/najemnici";
  try {
    const user = await currentUser();
    if (!user || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Nemáte oprávnění zveřejnit oznámení.");
    const form = await request.formData();
    const raw = String(form.get("audience") || ""), [kind, id, extra] = raw.split(":");
    if (!id || extra || !["lease", "property"].includes(kind)) throw new Error("Vyberte příjemce.");
    const lease = kind === "lease" ? await canPublishLeaseMessage(user, id) : null;
    if (kind === "lease" ? !lease || leaseStatusAt(lease) !== "ACTIVE" : !await canPublishPropertyMessage(user, id)) throw new Error("K vybraným příjemcům nemáte právo editace nebo nemají aktuální smlouvu.");
    const title = String(form.get("title") || "").trim(), body = String(form.get("body") || "").trim(), severity = String(form.get("severity") || "INFO");
    if (!title || title.length > 200 || !body || body.length > 5000 || !["INFO", "IMPORTANT", "CRITICAL"].includes(severity)) throw new Error("Vyplňte název do 200 znaků, sdělení do 5 000 znaků a důležitost.");
    const startsAt = inputDate(form.get("startsOn")) || new Date(), expiresAt = inputDate(form.get("expiresOn"), true);
    if (expiresAt && expiresAt <= startsAt) throw new Error("Konec platnosti musí následovat po zveřejnění.");
    const audience = kind === "lease" ? { kind: "TENANT_LEASE" as const, leaseId: id } : { kind: "TENANT_PROPERTY" as const, propertyId: id };
    const created = await prisma.$transaction(async tx => {
      const item = await tx.announcement.create({ data: { title, body, severity: severity as AnnouncementSeverity, startsAt, expiresAt, createdById: user.id, audiences: { create: audience } } });
      await tx.auditLog.create({ data: { userId: user.id, propertyId: lease?.unit.propertyId || id, action: "TENANT_ANNOUNCEMENT_CREATED", entityType: "Announcement", entityId: item.id, details: { audience, startsAt, expiresAt } } });
      return item;
    });
    return goWithMessage(request, `${target}#${created.id}`, "ok", "Oznámení bylo zveřejněno pro vybrané nájemníky.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Zveřejnění se nezdařilo."); }
}
