import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { previewForceRentNotifications, runRentNotifications } from "@/lib/rent-notifications";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    if (form.get("confirm") !== "on") return goWithMessage(request, "/nastaveni/upominky/vynutit", "error", "Vynucené rozeslání je nutné předem potvrdit.");
    const preview = await previewForceRentNotifications(new Date());
    if (!preview.candidates.length) return goWithMessage(request, "/nastaveni/upominky/vynutit", "ok", "Není žádná upomínka vhodná k vynucenému odeslání.");
    const result = await runRentNotifications(new Date(), "force");
    await audit(user.id, "RENT_NOTIFICATIONS_FORCED", "AppSetting", "global", JSON.parse(JSON.stringify({ preview: { leaseCount: preview.leaseCount, chargeCount: preview.chargeCount, outstandingCents: preview.outstandingCents }, result })) as Prisma.InputJsonObject);
    return goWithMessage(request, "/nastaveni/upominky/vynutit?done=1", result.counts.failed ? "error" : "ok", result.summary);
  } catch (error) {
    return goWithMessage(request, "/nastaveni/upominky/vynutit", "error", error instanceof Error ? error.message : "Vynucené rozeslání se nepodařilo spustit.");
  }
}
