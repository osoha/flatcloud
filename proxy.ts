import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE, previewRequestAllowed } from "./lib/user-context-policy";
import { checkSubscriptionRequest } from "./lib/subscriptions/request-guard";
import { subscriptionReason } from "./lib/subscriptions/request-policy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const preview = request.cookies.has(PREVIEW_COOKIE);
  // Overwrite, never trust client-supplied context headers. Guard all mutations,
  // including Next server actions and routes added after this feature.
  const headers = new Headers(request.headers);
  headers.set("x-flatberry-path", path);
  headers.set("x-flatberry-search", request.nextUrl.search);
  headers.set("x-flatberry-method", request.method);
  if (preview && !previewRequestAllowed(request.method, path)) {
    return NextResponse.json({error:"Pohled uživatele je pouze pro čtení. Nejprve ukončete náhled."},{status:403,headers:{"Cache-Control":"no-store"}});
  }
  if (preview && ["/uzivatele", "/nastaveni", "/dovednosti"].some(root => path === root || path.startsWith(root + "/"))) {
    return NextResponse.redirect(new URL("/nahled/omezeni", request.url));
  }
  try {
    const decision = await checkSubscriptionRequest(request);
    if (!decision.allowed) {
      const formNavigation = !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("accept")?.includes("text/html");
      if (path.startsWith("/api/") && !formNavigation) {
        return NextResponse.json({ error: decision.message || "Tato akce není dostupná v aktuálním předplatném.", code: decision.code || "SUBSCRIPTION_FEATURE", subscriptionUrl: "/ucet/predplatne" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
      }
      const target = new URL("/ucet/predplatne", request.url);
      target.searchParams.set("reason", subscriptionReason(decision.code));
      return NextResponse.redirect(target, 303);
    }
  } catch {
    // A billing lookup failure must not accidentally unlock a frozen portfolio.
    return NextResponse.json({ error: "Stav předplatného se nepodařilo ověřit. Zkuste to prosím znovu." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  const response = NextResponse.next({request:{headers}});
  if (preview) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
