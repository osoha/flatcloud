import { text } from "@/lib/forms";
import { requirePropertyAdmin } from "@/lib/management";
import { leaseReactivationErrorMessage, restoreCancelledLease } from "@/lib/lease-reactivation";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requirePropertyAdmin(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const restoreReason = text(form, "restoreReason", true)!;
    const restored = await restoreCancelledLease({ propertyId: id, leaseId, actor: access.user, restoreReason });
    const message = restored.derivedStatus === "ACTIVE"
      ? "Smlouva byla obnovena a nájemní vztah je aktivní."
      : "Smlouva byla obnovena jako budoucí nájemní vztah.";
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`, "ok", message);
  } catch (error) {
    return goWithMessage(
      request,
      `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`,
      "error",
      leaseReactivationErrorMessage(error),
    );
  }
}
