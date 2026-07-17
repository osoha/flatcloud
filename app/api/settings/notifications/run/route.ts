import { currentUser } from "@/lib/auth";
import { runRentNotifications } from "@/lib/rent-notifications";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request) { const user = await currentUser(); if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login"); try { const summary = await runRentNotifications(new Date(), true); return goWithMessage(request, "/nastaveni", "ok", `Ruční kontrola dokončena. ${summary}`); } catch (error) { return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Kontrolu se nepodařilo spustit."); } }
