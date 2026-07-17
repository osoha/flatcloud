import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request) {
  const user = await currentUser(); if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try { const result = await sendMail({ to: user.email, subject: "Test SMTP – FlatCloud Rent", text: "SMTP nastavení funguje.", html: '<div style="font-family:Arial,sans-serif"><h2>SMTP nastavení funguje</h2><p>Tento testovací e-mail odeslal FlatCloud Rent.</p></div>' }); if (!result.sent) throw new Error(result.reason); return goWithMessage(request, "/nastaveni", "ok", `Testovací e-mail byl odeslán na ${user.email}.`); } catch (error) { return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Testovací e-mail se nepodařilo odeslat."); }
}
