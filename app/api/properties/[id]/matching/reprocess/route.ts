import { requireManagedProperty, audit } from "@/lib/management";
import { processPropertyTransactions } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  const count = await processPropertyTransactions(id);
  await audit(access.user.id, "PAYMENTS_REPROCESSED", "Property", id, { count });
  return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", `Znovu zpracováno ${count} plateb.`);
}
