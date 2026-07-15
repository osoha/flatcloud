import { prisma } from "../lib/db";
import { syncBankAccount } from "../lib/banking/sync";
import { accountIsDue, appSettings } from "../lib/settings";

async function main() {
  const started = new Date();
  const settings = await appSettings();
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastCronStartedAt: started } });
  if (!settings.automaticBankSync) {
    await prisma.appSetting.update({ where: { id: "global" }, data: { lastCronFinishedAt: new Date(), lastCronSummary: "Automatická synchronizace je vypnuta." } });
    console.log("Automatická synchronizace je vypnuta.");
    return;
  }
  const accounts = await prisma.bankAccount.findMany({
    where: { autoSyncEnabled: true, connectionStatus: { in: ["CONNECTED", "ERROR"] }, provider: { not: "manual" } },
    orderBy: { lastSyncedAt: "asc" },
  });
  const due = accounts.filter((account) => accountIsDue(account.lastSyncedAt, settings.bankSyncsPerDay, started));
  let ok = 0;
  let failed = 0;
  let received = 0;
  for (const account of due) {
    try {
      const result = await syncBankAccount(account.id);
      ok += 1;
      received += result.received;
      console.log(`OK ${account.bankName} ${account.ibanMasked}: ${result.received} transakcí`);
    } catch (error) {
      failed += 1;
      console.error(`CHYBA ${account.bankName} ${account.ibanMasked}:`, error);
    }
  }
  const summary = `Účty ke zpracování: ${due.length}; úspěšně: ${ok}; chyby: ${failed}; transakce: ${received}.`;
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastCronFinishedAt: new Date(), lastCronSummary: summary } });
  await prisma.auditLog.create({ data: { action: "BANK_CRON", entityType: "System", details: { due: due.length, ok, failed, received } } });
  console.log(summary);
  if (failed > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
