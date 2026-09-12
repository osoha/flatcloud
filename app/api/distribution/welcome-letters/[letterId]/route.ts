import { requireUser } from "@/lib/auth";
import { reopenWelcomeLetter, sendWelcomeLetter, setWelcomeLetterReady, updateWelcomeLetter } from "@/lib/distribution/welcome-letters";
import { dateValue, text } from "@/lib/forms";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ letterId: string }> }) {
  const user = await requireUser(), { letterId } = await params, form = await request.formData(), returnTo = `/distribuce/uvitaci-dopisy/${letterId}`;
  try {
    const mode = String(form.get("mode") || "save");
    if (mode === "ready") await setWelcomeLetterReady(user, letterId);
    else if (mode === "reopen") await reopenWelcomeLetter(user, letterId);
    else if (mode === "send") { if (form.get("confirmSend") !== "yes") throw new Error("Před odesláním potvrďte kontrolu příjemce a příloh."); await sendWelcomeLetter(user, letterId); }
    else {
      const ownershipRegisteredAt = dateValue(form, "ownershipRegisteredAt"); if (!ownershipRegisteredAt) throw new Error("Doplňte datum nabytí podle katastru.");
      const value = (key: string) => text(form, key) || "";
      await updateWelcomeLetter(user, letterId, { recipientEmail: value("recipientEmail"), ownershipRegisteredAt, subject: value("subject"), introduction: value("introduction"), handoverText: value("handoverText"), leaseText: value("leaseText"), insuranceText: value("insuranceText"), managementText: value("managementText"), platformText: value("platformText"), taxText: value("taxText"), associationText: value("associationText"), closingText: value("closingText"), contactText: value("contactText"), documentIds: form.getAll("documentId").map(String) });
    }
    const messages: Record<string, string> = { save: "Koncept byl uložen.", ready: "Dopis je připraven k odeslání.", reopen: "Dopis byl vrácen k úpravám.", send: "Uvítací e-mail byl odeslán a zařazen do historie." };
    return goWithMessage(request, returnTo, "ok", messages[mode] || messages.save);
  } catch (error) { return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Operaci s uvítacím dopisem se nepodařilo dokončit."); }
}
