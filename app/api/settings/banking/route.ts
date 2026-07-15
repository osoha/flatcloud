import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

const allowed = new Set([1, 2, 3, 4, 6, 8, 12, 24]);

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    const bankSyncsPerDay = Number(form.get("bankSyncsPerDay"));
    if (!allowed.has(bankSyncsPerDay)) throw new Error("Vyberte podporovanou frekvenci synchronizace.");
    const automaticBankSync = form.get("automaticBankSync") === "on";
    await prisma.appSetting.upsert({ where: { id: "global" }, update: { automaticBankSync, bankSyncsPerDay }, create: { id: "global", automaticBankSync, bankSyncsPerDay } });
    await audit(user.id, "APP_SETTINGS_UPDATED", "AppSetting", "global", { automaticBankSync, bankSyncsPerDay });
    return goWithMessage(request, "/nastaveni", "ok", "Nastavení automatické synchronizace bylo uloženo.");
  } catch (error) {
    return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Nastavení se nepodařilo uložit.");
  }
}
