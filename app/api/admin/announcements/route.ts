import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import type { AnnouncementAudienceKind, AnnouncementSeverity, UserRole } from "@prisma/client";

const severities = new Set(["INFO", "IMPORTANT", "CRITICAL"]);
const roles = new Set(["SUPER_ADMIN", "MANAGER", "PROPERTY_MANAGER", "OWNER_VIEWER"]);

function dateTime(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Datum nebo čas není platný.");
  return parsed;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  if (user.role !== "SUPER_ADMIN") return goWithMessage(request, "/portfolio", "error", "Oznámení může spravovat pouze super-admin.");
  try {
    const form = await request.formData();
    const title = text(form, "title", true)!;
    const body = text(form, "body", true)!;
    const severity = text(form, "severity") || "INFO";
    if (!severities.has(severity)) throw new Error("Vyberte platnou důležitost.");
    const startsAt = dateTime(form.get("startsAt")) || new Date();
    const expiresAt = dateTime(form.get("expiresAt"));
    if (expiresAt && expiresAt <= startsAt) throw new Error("Exspirace musí být později než začátek zveřejnění.");

    const audiences: Array<{ kind: AnnouncementAudienceKind; role?: UserRole; propertyId?: string; userId?: string }> = [];
    if (form.get("allUsers") === "on") audiences.push({ kind: "ALL_USERS" });
    if (form.get("flatcloudMembers") === "on") audiences.push({ kind: "FLATCLOUD_MEMBERS" });
    for (const role of form.getAll("roles").map(String)) if (roles.has(role)) audiences.push({ kind: "ROLE", role: role as UserRole });
    for (const propertyId of form.getAll("propertyIds").map(String).filter(Boolean)) audiences.push({ kind: "PROPERTY", propertyId });
    for (const userId of form.getAll("userIds").map(String).filter(Boolean)) audiences.push({ kind: "USER", userId });
    if (!audiences.length) throw new Error("Vyberte alespoň jednu skupinu příjemců.");

    const announcement = await prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({ data: { title, body, severity: severity as AnnouncementSeverity, startsAt, expiresAt, createdById: user.id, audiences: { create: audiences } } });
      await tx.auditLog.create({ data: { userId: user.id, action: "ANNOUNCEMENT_CREATED", entityType: "Announcement", entityId: created.id, details: { title, severity, startsAt, expiresAt, audiences } } });
      return created;
    });
    return goWithMessage(request, `/nastaveni/oznameni#${announcement.id}`, "ok", "Oznámení bylo zveřejněno.");
  } catch (error) {
    return goWithMessage(request, "/nastaveni/oznameni", "error", error instanceof Error ? error.message : "Oznámení se nepodařilo vytvořit.");
  }
}
