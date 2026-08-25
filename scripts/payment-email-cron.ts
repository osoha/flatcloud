import { prisma } from "../lib/db";
import { syncInboundMailbox } from "../lib/inbound-bank/sync";

async function main() {
  const started = new Date();
  try {
    const result = await syncInboundMailbox();
    await prisma.auditLog.create({ data: { action: "PAYMENT_EMAIL_CRON", entityType: "AppSetting", entityId: "global", details: { ...result, startedAt: started.toISOString() } } });
    console.log(result.summary || (result.enabled ? "Sběrný e-mail zkontrolován." : "Sběrný e-mail je vypnutý."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.auditLog.create({ data: { action: "PAYMENT_EMAIL_CRON_FAILED", entityType: "AppSetting", entityId: "global", details: { message, startedAt: started.toISOString() } } }).catch(() => undefined);
    console.error(message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
