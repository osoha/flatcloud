import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage, safeInternalReturnPath } from "@/lib/route-response";
import { announcementAudienceWhere } from "@/lib/announcements";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  const announcement = await prisma.announcement.findFirst({ where: { id, ...announcementAudienceWhere(user) }, select: { id: true } });
  if (!announcement) return goWithMessage(request, "/portfolio", "error", "Oznámení nebylo nalezeno.");
  const form = await request.formData();
  const action = String(form.get("action") || "dismiss");
  if (!["dismiss", "restore"].includes(action)) return goWithMessage(request, "/portfolio", "error", "Neplatná akce.");
  await prisma.announcementUserState.upsert({
    where: { announcementId_userId: { announcementId: id, userId: user.id } },
    create: { announcementId: id, userId: user.id, dismissedAt: action === "dismiss" ? new Date() : null, readAt: new Date() },
    update: { dismissedAt: action === "dismiss" ? new Date() : null, readAt: new Date() },
  });
  return goWithMessage(request, safeInternalReturnPath(form.get("returnTo"), "/portfolio"), "ok", action === "dismiss" ? "Oznámení už se na hlavní stránce nezobrazuje." : "Oznámení bylo vráceno.");
}
