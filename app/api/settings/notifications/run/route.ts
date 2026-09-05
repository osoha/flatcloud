import { currentUser } from "@/lib/auth";
import { runRentNotifications } from "@/lib/rent-notifications";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const result = await runRentNotifications(new Date(), "manual");
    return goWithMessage(request, "/nastaveni/system", "ok", result.summary);
  } catch (error) {
    return goWithMessage(request, "/nastaveni/system", "error", error instanceof Error ? error.message : "Kontrolu se nepodařilo spustit.");
  }
}
