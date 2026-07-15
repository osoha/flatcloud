import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bankingProvider } from "@/lib/banking";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { redirectUrl } from "@/lib/redirect-url";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const form = await request.formData();
  const propertyId = text(form, "propertyId", true)!;
  const access = await requireManagedProperty(propertyId);
  if (!access) return NextResponse.redirect(redirectUrl("/login", request), 303);
  try {
    const provider = bankingProvider();
    if (!provider.configured()) throw new Error("Bankovní poskytovatel není nakonfigurován v Render Environment.");
    const bankName = text(form, "bankName", true)!;
    const country = (text(form, "country") || "CZ").toUpperCase();
    const psuType = text(form, "psuType") || "business";
    const state = randomUUID();
    const authorization = await prisma.bankAuthorization.create({
      data: {
        propertyId,
        provider: provider.key,
        state,
        bankName,
        country,
        psuType,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      },
    });
    const callbackUrl = redirectUrl("/api/banking/callback", request).toString();
    const started = await provider.startAuthorization({
      bankName,
      country,
      psuType,
      state,
      redirectUrl: callbackUrl,
      psuIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") || undefined,
    });
    await prisma.bankAuthorization.update({ where: { id: authorization.id }, data: { externalAuthorizationId: started.externalAuthorizationId } });
    await audit(access.user.id, "BANK_AUTH_STARTED", "BankAuthorization", authorization.id, { propertyId, provider: provider.key, bankName, country, psuType });
    return NextResponse.redirect(started.url, 303);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${propertyId}/banka`, "error", error instanceof Error ? error.message : "Bankovní autorizaci se nepodařilo zahájit.");
  }
}
