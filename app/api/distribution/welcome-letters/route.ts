import { requireUser } from "@/lib/auth";
import { createWelcomeLetter } from "@/lib/distribution/welcome-letters";
import { dateValue } from "@/lib/forms";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requireUser();
  try {
    const form = await request.formData(), ownershipRegisteredAt = dateValue(form, "ownershipRegisteredAt");
    if (!ownershipRegisteredAt) throw new Error("Doplňte datum nabytí podle katastru.");
    const letter = await createWelcomeLetter(user, { opportunityId: String(form.get("opportunityId") || ""), ownershipRegisteredAt });
    return goWithMessage(request, `/distribuce/uvitaci-dopisy/${letter.id}`, "ok", "Koncept uvítacího dopisu byl vytvořen.");
  } catch (error) { return goWithMessage(request, "/distribuce/uvitaci-dopisy", "error", error instanceof Error ? error.message : "Uvítací dopis se nepodařilo vytvořit."); }
}
