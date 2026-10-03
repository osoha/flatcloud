import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { go, goWithMessage } from "@/lib/route-response";
import { redirectUrl } from "@/lib/redirect-url";
export async function POST(request: Request) {
  const user = await currentUser(); if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try { const result = await sendMail({ to: user.email, subject: "Test SMTP – FlatBerry", text: "SMTP nastavení FlatBerry funguje.", html: '<h2>SMTP nastavení funguje</h2><p>Tento testovací e-mail odeslalo FlatBerry.</p>' }); if (!result.sent) throw new Error(result.reason); return goWithMessage(request, "/nastaveni/system", "ok", `Testovací e-mail byl odeslán na ${user.email}.`); } catch (error) { return goWithMessage(request, "/nastaveni/system", "error", error instanceof Error ? error.message : "Testovací e-mail se nepodařilo odeslat."); }
}
