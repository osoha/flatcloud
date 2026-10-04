import { currentUser } from "@/lib/auth";
import { displayModeCookie } from "@/lib/display-mode";
import { go, safeInternalReturnPath } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const form = await request.formData();
  const mode = form.get("mode");
  if (mode !== "basic" && mode !== "pro") return go(request, "/portfolio");
  const returnTo = safeInternalReturnPath(form.get("returnTo"), "/portfolio");
  // Preserve portfolio, document filters and the reviewed unit page across modes.
  // Unrelated return paths still fall back to the portfolio.
  const unitReturn = /^\/nemovitosti\/[a-zA-Z0-9_-]+\/jednotky\/[a-zA-Z0-9_-]+$/.test(returnTo);
  const documentReturn = returnTo === "/dokumenty" || returnTo.startsWith("/dokumenty?");
  const response = go(request, returnTo.startsWith("/portfolio?") || returnTo === "/portfolio" || unitReturn || documentReturn ? returnTo : "/portfolio");
  response.cookies.set(displayModeCookie(user.id), mode, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
