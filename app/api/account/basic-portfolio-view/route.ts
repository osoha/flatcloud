import {cookies} from "next/headers";
import {currentUser} from "@/lib/auth";
import {basicPortfolioView, basicPortfolioViewCookie} from "@/lib/basic-portfolio-view";
import {guideOriginMatches} from "@/lib/guide-origin";
import {go, safeInternalReturnPath} from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || request.headers.get("sec-fetch-site") === "cross-site" || !guideOriginMatches(request)) return new Response("Nemáte oprávnění.", {status: 403});
  const form = await request.formData(), raw = String(form.get("view") || ""), view = basicPortfolioView(raw);
  if (!view && raw !== "auto") return new Response("Neplatný pohled.", {status: 400});
  const store = await cookies(), key = basicPortfolioViewCookie(user.id);
  if (view) store.set(key, view, {httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31_536_000});
  else store.delete(key);
  const target = new URL(safeInternalReturnPath(form.get("returnTo"), "/portfolio"), "http://localhost");
  target.searchParams.delete("basicView");
  return go(request, target.pathname + target.search + "#nemovitosti");
}
