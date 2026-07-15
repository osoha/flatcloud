import { OwnerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const owner = await prisma.owner.create({
      data: {
        name: text(form, "name", true)!,
        type: (text(form, "type") || "COMPANY") as OwnerType,
        ico: text(form, "ico"),
        email: text(form, "email"),
        phone: text(form, "phone"),
        address: text(form, "address"),
        note: text(form, "note"),
      },
    });
    await audit(user.id, "OWNER_CREATED", "Owner", owner.id, { name: owner.name });
    return goWithMessage(request, `/vlastnici/${owner.id}`, "ok", "Vlastník byl vytvořen.");
  } catch (error) {
    return goWithMessage(request, "/vlastnici", "error", error instanceof Error ? error.message : "Vlastníka se nepodařilo vytvořit.");
  }
}
