import { redirectUrl } from "./redirect-url";

/** Use the configured public origin, including Render's internal request proxy. */
export function guideOriginMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === redirectUrl("/", request).origin;
}
