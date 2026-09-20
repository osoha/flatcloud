import { cookies } from "next/headers";
import { actualUser } from "./auth";
import { PREVIEW_COOKIE } from "./user-context-policy";
export async function actualToolAdmin() {
  // Never deliver this tool or a credential into a simulated user's context,
  // even when both the actor and the target are administrators.
  if ((await cookies()).has(PREVIEW_COOKIE)) return null;
  const user = await actualUser();
  return user?.role === "SUPER_ADMIN" ? user : null;
}
