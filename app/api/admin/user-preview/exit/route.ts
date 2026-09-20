import { cookies } from "next/headers";
import { actualUser } from "@/lib/auth";
import { PREVIEW_COOKIE } from "@/lib/user-context-policy";
import { audit } from "@/lib/management";
import { go } from "@/lib/route-response";
export async function POST(request: Request) {
  const actor = await actualUser();
  (await cookies()).delete(PREVIEW_COOKIE);
  if (actor) await audit(actor.id,"USER_PREVIEW_ENDED","User",actor.id,{readOnly:true});
  return go(request,actor?.role === "SUPER_ADMIN" ? "/uzivatele" : "/login");
}
