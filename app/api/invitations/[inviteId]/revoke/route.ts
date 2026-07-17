import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePropertyAdmin, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

function safeReturnTo(value: FormDataEntryValue | null, propertyId: string) {
  const candidate = String(value || "");
  if (candidate === "/uzivatele") return candidate;
  if (candidate === `/nemovitosti/${propertyId}/uzivatele`) return candidate;
  return `/nemovitosti/${propertyId}/uzivatele`;
}

export async function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const invitation = await prisma.userInvitation.findUnique({ where: { id: inviteId } });
  if (!invitation) return go(request, "/portfolio");

  const user = await currentUser();
  if (!user) return go(request, "/login");
  if (user.role !== "SUPER_ADMIN") {
    const access = await requirePropertyAdmin(invitation.propertyId);
    if (!access || access.user.id !== user.id) return go(request, "/portfolio");
  }

  const form = await request.formData();
  const returnTo = safeReturnTo(form.get("returnTo"), invitation.propertyId);
  if (invitation.status !== "PENDING") return goWithMessage(request, returnTo, "ok", "Pozvánka už byla dříve zneplatněna.");

  await prisma.userInvitation.update({ where: { id: inviteId }, data: { status: "REVOKED" } });
  await audit(user.id, "INVITATION_REVOKED", "UserInvitation", inviteId, {
    propertyId: invitation.propertyId,
    email: invitation.email,
    source: returnTo === "/uzivatele" ? "global-user-list" : "property-user-list",
  });
  return goWithMessage(request, returnTo, "ok", "Pozvánka byla smazána ze seznamu a její odkaz byl zneplatněn.");
}
