import { prisma } from "../lib/db";
import { syncBankAccount } from "../lib/banking/sync";
import { syncInboundMailbox } from "../lib/inbound-bank/sync";
import { accountIsDue, appSettings } from "../lib/settings";

async function main() {
  const started = new Date();
  const settings = await appSettings();
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastCronStartedAt: started } });

  let dueCount = 0;
  let ok = 0;
  let bankFailed = 0;
  let emailFailed = 0;
  let received = 0;
  if (settings.automaticBankSync) {
    const accounts = await prisma.bankAccount.findMany({
      where: { autoSyncEnabled: true, connectionStatus: { in: ["CONNECTED", "ERROR"] }, provider: { notIn: ["manual", "rb-email"] } },
      orderBy: { lastSyncedAt: "asc" },
    });
    const due = accounts.filter((account) => accountIsDue(account.lastSyncedAt, settings.bankSyncsPerDay, started));
    dueCount = due.length;
    for (const account of due) {
      try {
        const result = await syncBankAccount(account.id);
        ok += 1;
        received += result.received;
        console.log(`OK ${account.bankName} ${account.ibanMasked}: ${result.received} transakcí`);
      } catch (error) {
        bankFailed += 1;
        console.error(`CHYBA ${account.bankName} ${account.ibanMasked}:`, error);
      }
    }
  }

  let emailSummary = settings.inboundMailEnabled ? "E-mail nebyl zpracován." : "E-mail vypnutý.";
  try {
    const email = await syncInboundMailbox();
    emailSummary = email.enabled ? email.summary || "E-mail zkontrolován." : "E-mail vypnutý.";
  } catch (error) {
    emailFailed += 1;
    emailSummary = `E-mail chyba: ${error instanceof Error ? error.message : "neznámá chyba"}`;
    await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastCheckedAt: new Date(), inboundMailLastSummary: emailSummary } }).catch(() => null);
    console.error(emailSummary);
  }

  const bankSummary = settings.automaticBankSync
    ? `API účty: ${dueCount}; úspěšně: ${ok}; chyby: ${bankFailed}; transakce: ${received}.`
    : "API synchronizace vypnuta.";
  const summary = `${bankSummary} ${emailSummary}`;
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastCronFinishedAt: new Date(), lastCronSummary: summary } });
  await prisma.auditLog.create({ data: { action: "BANK_CRON", entityType: "System", details: { due: dueCount, ok, bankFailed, emailFailed, received, emailSummary } } });
  console.log(summary);
  if (bankFailed + emailFailed > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
