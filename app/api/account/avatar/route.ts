import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processAvatarUpload } from "@/lib/avatar";
import { go, goWithMessage } from "@/lib/route-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");

  try {
    const form = await request.formData();
    const removeAvatar = form.get("removeAvatar") === "on";
    const avatarUpdate = removeAvatar
      ? { avatarData: null, avatarMimeType: null }
      : await processAvatarUpload(form.get("avatar"));

    if (!avatarUpdate) throw new Error("Vyberte fotografii nebo zaškrtněte odstranění současného avataru.");

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: avatarUpdate }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: removeAvatar ? "AVATAR_REMOVED" : "AVATAR_UPDATED",
          entityType: "User",
          entityId: user.id,
        },
      }),
    ]);

    return goWithMessage(request, "/ucet", "ok", removeAvatar ? "Avatar byl odstraněn." : "Avatar byl uložen a automaticky upraven pro zobrazení v aplikaci.");
  } catch (error) {
    return goWithMessage(request, "/ucet", "error", error instanceof Error ? error.message : "Avatar se nepodařilo uložit.");
  }
}
