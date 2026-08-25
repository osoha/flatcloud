import { prisma } from "../lib/db";
import { syncInboundMailbox } from "../lib/inbound-bank/sync";
import { runRentNotifications } from "../lib/rent-notifications";
import { runChargeAutomation } from "../lib/charge-automation";

type StepResult = { name: string; status: "ok" | "skipped" | "failed"; summary: string };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMailboxSetupSkip(message: string) {
  return message.includes("Sběrný e-mail je zapnutý, ale chybí IMAP server, uživatel nebo heslo");
}

async function main() {
  const startedAt = new Date();
  const steps: StepResult[] = [];
  let hardFailure = false;

  try {
    const bank = await syncInboundMailbox();
    steps.push({ name: "bank-email", status: bank.enabled ? "ok" : "skipped", summary: bank.enabled ? bank.summary || "Sběrný e-mail zkontrolován." : "Sběrný e-mail není zapnutý – krok přeskočen." });
  } catch (error) {
    const message = messageOf(error);
    if (isMailboxSetupSkip(message)) steps.push({ name: "bank-email", status: "skipped", summary: `${message} Krok byl bezpečně přeskočen.` });
    else { steps.push({ name: "bank-email", status: "failed", summary: message }); hardFailure = true; }
  }

  try {
    const charges = await runChargeAutomation();
    steps.push({ name: "charges", status: "ok", summary: charges.summary });
  } catch (error) {
    steps.push({ name: "charges", status: "failed", summary: messageOf(error) });
    hardFailure = true;
  }

  try {
    const notifications = await runRentNotifications();
    steps.push({ name: "notifications", status: "ok", summary: notifications.summary });
  } catch (error) {
    steps.push({ name: "notifications", status: "failed", summary: messageOf(error) });
    hardFailure = true;
  }

  const summary = steps.map((step) => `${step.name}: ${step.status} – ${step.summary}`).join(" | ");
  await prisma.auditLog.create({
    data: {
      action: hardFailure ? "SCHEDULER_CRON_FAILED" : "SCHEDULER_CRON",
      entityType: "AppSetting",
      entityId: "global",
      details: { startedAt: startedAt.toISOString(), steps, summary },
    },
  }).catch(() => undefined);
  console.log(summary);
  if (hardFailure) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
