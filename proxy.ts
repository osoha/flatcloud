import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE, previewRequestAllowed } from "./lib/user-context-policy";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const preview = request.cookies.has(PREVIEW_COOKIE);
  // Overwrite, never trust client-supplied context headers. Guard all mutations,
  // including Next server actions and routes added after this feature.
  const headers = new Headers(request.headers);
  headers.set("x-flatberry-path", path);
  headers.set("x-flatberry-method", request.method);
  if (preview && !previewRequestAllowed(request.method, path)) {
    return NextResponse.json({error:"Pohled uživatele je pouze pro čtení. Nejprve ukončete náhled."},{status:403,headers:{"Cache-Control":"no-store"}});
  }
  if (preview && ["/uzivatele", "/nastaveni", "/dovednosti", "/login"].some(root => path === root || path.startsWith(root + "/"))) {
    return NextResponse.redirect(new URL("/nahled/omezeni", request.url));
  }
  const response = NextResponse.next({request:{headers}});
  if (preview) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
