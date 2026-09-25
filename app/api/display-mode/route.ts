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
  const response = go(request, returnTo.startsWith("/portfolio?") || returnTo === "/portfolio" ? returnTo : "/portfolio");
  response.cookies.set(displayModeCookie(user.id), mode, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
