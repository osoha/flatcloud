import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { go, goWithMessage } from "@/lib/route-response";
import { redirectUrl } from "@/lib/redirect-url";
export async function POST(request: Request) {
  const user = await currentUser(); if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const login = redirectUrl("/login", request).toString(), home = redirectUrl("/", request).toString();
  try { const result = await sendMail({ to: user.email, subject: "Test SMTP – FlatBerry", text: `SMTP nastavení funguje.\nPřihlášení: ${login}\nVeřejný web: ${home}`, html: `<div style="font-family:Arial,sans-serif"><h2>SMTP nastavení funguje</h2><p>Tento testovací e-mail odeslala aplikace FlatBerry.</p><p><a href="${login}">Přihlášení</a> · <a href="${home}">Veřejný web</a></p></div>` }); if (!result.sent) throw new Error(result.reason); return goWithMessage(request, "/nastaveni/system", "ok", `Testovací e-mail byl odeslán na ${user.email}.`); } catch (error) { return goWithMessage(request, "/nastaveni/system", "error", error instanceof Error ? error.message : "Testovací e-mail se nepodařilo odeslat."); }
}
