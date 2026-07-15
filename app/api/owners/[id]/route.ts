import { OwnerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  const { id } = await params;
  try {
    const form = await request.formData();
    const owner = await prisma.owner.update({
      where: { id },
      data: {
        name: text(form, "name", true)!,
        type: (text(form, "type") || "COMPANY") as OwnerType,
        ico: text(form, "ico"),
        email: text(form, "email"),
        phone: text(form, "phone"),
        address: text(form, "address"),
        note: text(form, "note"),
        active: boolValue(form, "active"),
      },
    });
    await audit(user.id, "OWNER_UPDATED", "Owner", owner.id, { name: owner.name });
    return goWithMessage(request, `/vlastnici/${id}`, "ok", "Změny byly uloženy.");
  } catch (error) {
    return goWithMessage(request, `/vlastnici/${id}`, "error", error instanceof Error ? error.message : "Změny se nepodařilo uložit.");
  }
}
