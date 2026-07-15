import { NextResponse } from "next/server";
import { bankingProvider } from "@/lib/banking";
import { openCredentials, sealCredentials } from "@/lib/banking/secret";
import { prisma } from "@/lib/db";
import { syncBankAccount } from "@/lib/banking/sync";
import { redirectUrl } from "@/lib/redirect-url";

function maskIban(iban?: string) {
  if (!iban) return "Účet bez dostupného IBAN";
  const clean = iban.replace(/\s+/g, "");
  return clean.length <= 8 ? clean : `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const callbackError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const authorization = await prisma.bankAuthorization.findUnique({ where: { state } });
  if (!authorization) return NextResponse.redirect(redirectUrl("/portfolio?error=" + encodeURIComponent("Bankovní autorizace nebyla nalezena."), request), 303);
  const back = `/nemovitosti/${authorization.propertyId}/banka`;
  try {
    if (callbackError) throw new Error(callbackError);
    if (!code) throw new Error("Banka nevrátila autorizační kód.");
    if (authorization.expiresAt < new Date()) throw new Error("Autorizační relace vypršela. Spusťte připojení znovu.");
    const provider = bankingProvider(authorization.provider);
    const callbackUrl = redirectUrl("/api/banking/callback", request).toString();
    const completed = await provider.completeAuthorization({
      code,
      redirectUrl: callbackUrl,
      context: openCredentials(authorization.providerContextEncrypted),
      psuIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") || undefined,
    });
    if (!completed.accounts.length) throw new Error("Banka neposkytla žádný dostupný účet.");
    const accountIds: string[] = [];
    for (const account of completed.accounts) {
      const existingByHash = account.identificationHash
        ? await prisma.bankAccount.findFirst({ where: { provider: authorization.provider, identificationHash: account.identificationHash } })
        : null;
      const data = {
        propertyId: authorization.propertyId,
        provider: authorization.provider,
        bankName: authorization.bankName,
        accountName: account.name,
        iban: account.iban,
        ibanMasked: maskIban(account.iban),
        currency: account.currency,
        externalAccountId: account.externalAccountId,
        externalSessionId: completed.sessionId,
        identificationHash: account.identificationHash,
        connectedById: authorization.connectedById,
        credentialsEncrypted: sealCredentials(completed.credentials),
        connectionStatus: "CONNECTED" as const,
        consentExpiresAt: completed.consentExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      const saved = existingByHash
        ? await prisma.bankAccount.update({ where: { id: existingByHash.id }, data })
        : await prisma.bankAccount.upsert({
            where: { provider_externalAccountId: { provider: authorization.provider, externalAccountId: account.externalAccountId } },
            update: data,
            create: data,
          });
      accountIds.push(saved.id);
    }
    await prisma.bankAuthorization.update({ where: { id: authorization.id }, data: { status: "COMPLETED", externalSessionId: completed.sessionId, providerContextEncrypted: null } });
    let imported = 0;
    for (const accountId of accountIds) {
      const result = await syncBankAccount(accountId);
      imported += result.created;
    }
    return NextResponse.redirect(redirectUrl(`${back}?ok=${encodeURIComponent(`Bankovní účet byl připojen. Nově načtené příchozí platby: ${imported}.`)}`, request), 303);
  } catch (error) {
    await prisma.bankAuthorization.update({ where: { id: authorization.id }, data: { status: "FAILED", providerContextEncrypted: null } }).catch(() => null);
    return NextResponse.redirect(redirectUrl(`${back}?error=${encodeURIComponent(error instanceof Error ? error.message : "Bankovní autorizace selhala.")}`, request), 303);
  }
}
