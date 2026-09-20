import { NextResponse } from "next/server";
import { actualToolAdmin } from "@/lib/admin-tools";
import { prisma } from "@/lib/db";
import { sealSecret, openSecret } from "@/lib/secret";
import { audit } from "@/lib/management";
const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
export async function GET(request: Request) {
  const user = await actualToolAdmin();
  if (!user) return NextResponse.json({error:"Nástroj je určen hlavnímu administrátorovi mimo náhled."},{status:403,headers});
  const setting = await prisma.userPrivateToolSettings.findUnique({where:{userId:user.id},select:{mapsKeyEncrypted:true}});
  if (new URL(request.url).searchParams.get("use") !== "sdk") return NextResponse.json({configured:Boolean(setting?.mapsKeyEncrypted)},{headers});
  try { return NextResponse.json({key:openSecret(setting?.mapsKeyEncrypted) || null},{headers}); }
  catch { return NextResponse.json({error:"Uložený klíč nelze otevřít. Uložte jej znovu."},{status:503,headers}); }
}
export async function POST(request: Request) {
  const user = await actualToolAdmin();
  if (!user || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({error:"Přístup není povolen."},{status:403,headers});
  try {
    const body = await request.json();
    if (body.action !== "forget" && (typeof body.key !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(body.key))) return NextResponse.json({error:"Zadejte platný Maps demo klíč."},{status:400,headers});
    const encrypted = body.action === "forget" ? null : sealSecret(body.key);
    await prisma.$transaction(async tx => {
      await tx.userPrivateToolSettings.upsert({where:{userId:user.id},create:{userId:user.id,mapsKeyEncrypted:encrypted},update:{mapsKeyEncrypted:encrypted}});
      await tx.auditLog.create({data:{userId:user.id,action:encrypted ? "PRIVATE_MAPS_KEY_SAVED" : "PRIVATE_MAPS_KEY_FORGOTTEN",entityType:"UserPrivateToolSettings",entityId:user.id}});
    });
    return NextResponse.json({configured:Boolean(encrypted)},{headers});
  } catch { return NextResponse.json({error:"Klíč se nepodařilo uložit. Zkontrolujte nastavení šifrování služby."},{status:500,headers}); }
}
