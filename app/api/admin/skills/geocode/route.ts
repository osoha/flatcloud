import { NextResponse } from "next/server";
import { actualToolAdmin } from "@/lib/admin-tools";
import { prisma } from "@/lib/db";
import { openSecret } from "@/lib/secret";
import { geocodeCandidates } from "@/lib/skills/geocode";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const user = await actualToolAdmin();
  if (!user || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({error:"Přístup není povolen."},{status:403,headers});
  try {
    const body = await request.json();
    if (typeof body.address !== "string" || body.address.trim().length < 3 || body.address.length > 300) return NextResponse.json({error:"Zadejte ulici, celé číslo domu a obec."},{status:400,headers});
    const setting = await prisma.userPrivateToolSettings.findUnique({where:{userId:user.id},select:{mapsKeyEncrypted:true}});
    const key = openSecret(setting?.mapsKeyEncrypted);
    if (!key) return NextResponse.json({error:"Nejdříve uložte svůj Maps demo klíč."},{status:400,headers});
    const address=body.address.trim();
    const url = new URL("https://geocode.googleapis.com/v4/geocode/address/"+encodeURIComponent(address));
    url.search = new URLSearchParams({languageCode:"cs",regionCode:"CZ"}).toString();
    const response=await fetch(url,{headers:{"X-Goog-Api-Key":key},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
    if(!response.ok) return NextResponse.json({error:response.status===429?"Vyhledávání dosáhlo limitu. Vyčkejte nebo použijte souřadnice.":"Google odmítl vyhledávání. Ověřte přístup klíče ke Geocoding v4 nebo použijte souřadnice."},{status:502,headers});
    const data=await response.json();
    return NextResponse.json({results:geocodeCandidates(data.results,address)},{headers});
  } catch { return NextResponse.json({error:"Vyhledávání se nezdařilo. Zkuste znovu nebo zadejte souřadnice."},{status:502,headers}); }
}
