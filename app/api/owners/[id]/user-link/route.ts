import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentUser();
  if (!admin || admin.role !== UserRole.SUPER_ADMIN) return go(request, "/login");
  const { id } = await params;
  try {
    const form = await request.formData();
    const email = String(form.get("userEmail") || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || form.get("confirmOwnerLink") !== "on") {
      throw new Error("Vyplňte e-mail uživatele a potvrďte zpřístupnění údajů vlastníka.");
    }
    await prisma.$transaction(async (tx) => {
      const [owner, linkedUser] = await Promise.all([
        tx.owner.findUnique({ where: { id }, select: { id: true, name: true, active: true, userId: true } }),
        tx.user.findUnique({ where: { email }, select: { id: true, email: true, active: true, role: true } }),
      ]);
      if (!owner?.active) throw new Error("Aktivní vlastník nebyl nalezen.");
      if (!linkedUser?.active || linkedUser.role === UserRole.TENANT) throw new Error("Aktivní uživatel nebyl nalezen.");
      if (owner.userId) throw new Error("Vlastník již má propojený uživatelský účet.");
      if (await tx.owner.findUnique({ where: { userId: linkedUser.id }, select: { id: true } })) {
        throw new Error("Uživatelský účet je propojený s jiným vlastníkem.");
      }
      const updated = await tx.owner.updateMany({ where: { id, userId: null, active: true }, data: { userId: linkedUser.id } });
      if (updated.count !== 1) throw new Error("Vazba vlastníka se mezitím změnila. Načtěte stránku znovu.");
      await tx.auditLog.create({ data: { userId: admin.id, action: "OWNER_USER_LINKED", entityType: "Owner", entityId: id, details: { ownerName: owner.name, linkedUserId: linkedUser.id, linkedUserEmail: linkedUser.email } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return goWithMessage(request, `/vlastnici/${id}`, "ok", "Uživatel byl propojen s vlastníkem.");
  } catch (error) {
    return goWithMessage(request, `/vlastnici/${id}`, "error", error instanceof Error ? error.message : "Vazbu se nepodařilo uložit.");
  }
}
