import { actualToolAdmin } from "@/lib/admin-tools";
import { houseAvatarTemplate } from "@/lib/skills/house-avatar-template";
export async function GET() {
  if (!await actualToolAdmin()) return new Response("Přístup není povolen.",{status:403});
  return new Response(houseAvatarTemplate,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Frame-Options":"SAMEORIGIN","Content-Security-Policy":"frame-ancestors 'self'; base-uri 'none'; object-src 'none'"}});
}
