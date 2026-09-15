import { requireManagedProperty } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; ownershipId: string }> }) {
 const { id, unitId } = await params;
 if (!await requireManagedProperty(id)) return go(request,"/login");
 return goWithMessage(request,`/nemovitosti/${id}/jednotky/${unitId}/upravit`,"error","Vlastnické záznamy se nemažou ani nepřepisují tímto formulářem. Použijte potvrzený převod s historií nebo samostatné potvrzení příjemce plateb.");
}
