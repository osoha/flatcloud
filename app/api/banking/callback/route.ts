import { NextResponse } from "next/server";
import { bankingProvider } from "@/lib/banking";
import { prisma } from "@/lib/db";
import { processPropertyTransactions } from "@/lib/matching";
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
    const completed = await provider.completeAuthorization({
      code,
      psuIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") || undefined,
    });
    if (!completed.accounts.length) throw new Error("Banka neposkytla žádný dostupný účet.");
    const accountIds: string[] = [];
    for (const account of completed.accounts) {
      const existing = account.identificationHash ? await prisma.bankAccount.findFirst({ where: { provider: authorization.provider, identificationHash: account.identificationHash } }) : null;
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
        connectionStatus: "CONNECTED" as const,
        consentExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      const saved = existing
        ? await prisma.bankAccount.update({ where: { id: existing.id }, data })
        : await prisma.bankAccount.upsert({ where: { externalAccountId: account.externalAccountId }, update: data, create: data });
      accountIds.push(saved.id);
    }
    await prisma.bankAuthorization.update({ where: { id: authorization.id }, data: { status: "COMPLETED", externalSessionId: completed.sessionId } });
    for (const accountId of accountIds) {
      const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
      if (!account) continue;
      const incoming = await provider.sync(account);
      const ids: string[] = [];
      for (const item of incoming) {
        const saved = await prisma.bankTransaction.upsert({
          where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: item.externalId } },
          update: { ...item },
          create: { ...item, bankAccountId: account.id },
        });
        ids.push(saved.id);
      }
      const balance = await provider.balance(account).catch(() => null);
      await prisma.bankAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), ...(balance ? { balanceCents: balance.amountCents, balanceUpdatedAt: new Date() } : {}) } });
      await processPropertyTransactions(authorization.propertyId, ids);
    }
    return NextResponse.redirect(redirectUrl(`${back}?ok=${encodeURIComponent("Bankovní účet byl připojen a transakce byly načteny.")}`, request), 303);
  } catch (error) {
    await prisma.bankAuthorization.update({ where: { id: authorization.id }, data: { status: "FAILED" } }).catch(() => null);
    return NextResponse.redirect(redirectUrl(`${back}?error=${encodeURIComponent(error instanceof Error ? error.message : "Bankovní autorizace selhala.")}`, request), 303);
  }
}
