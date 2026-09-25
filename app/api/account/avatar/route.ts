import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processAvatarUpload } from "@/lib/avatar";
import { go, goWithMessage } from "@/lib/route-response";
import { validIllustration } from "@/lib/illustration-library";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");

  try {
    const form = await request.formData();
    const removeAvatar = form.get("removeAvatar") === "on";
    const choice = String(form.get("avatarChoice") || "");
    if (choice && !validIllustration(choice, "person")) throw new Error("Vyberte dostupný avatar.");
    const uploaded = removeAvatar ? null : await processAvatarUpload(form.get("avatar"));
    const avatarUpdate = removeAvatar
      ? { avatarData: null, avatarMimeType: null, avatarChoice: choice || null }
      : uploaded ? { ...uploaded, avatarChoice: null } : choice ? { avatarChoice: choice, avatarData: null, avatarMimeType: null } : null;

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

    return goWithMessage(request, "/ucet", "ok", removeAvatar ? "Profilová fotografie byla odstraněna." : uploaded ? "Fotografie byla uložena." : "Avatar z knihovny byl uložen.");
  } catch (error) {
    return goWithMessage(request, "/ucet", "error", error instanceof Error ? error.message : "Avatar se nepodařilo uložit.");
  }
}
