import { collectTaskNotifications, processTaskNotifications } from "../lib/task-notifications";
import { prisma } from "../lib/db";
import { syncInboundMailbox } from "../lib/inbound-bank/sync";
import { cleanupInboundMailbox } from "../lib/inbound-bank/retention";
import { runRentNotifications } from "../lib/rent-notifications";
import { runChargeAutomation } from "../lib/charge-automation";
import { syncLifecycleCaches } from "../lib/lease-lifecycle";
import { syncMfRentDatasets } from "../lib/reporting/mf-rent/service";
import { runTaskAutomation } from "../lib/task-automation";
import { syncCsuApartmentAverage, syncCsuApartmentIndex } from "../lib/reporting/csu-apartment-index";

import { captureSystemDailySnapshot } from "../lib/admin-operations";

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
    const lifecycle = await syncLifecycleCaches();
    steps.push({ name: "lifecycle", status: "ok", summary: `Synchronizováno ${lifecycle.leaseChanges} smluv a ${lifecycle.unitChanges} jednotek.` });
  } catch (error) {
    steps.push({ name: "lifecycle", status: "failed", summary: messageOf(error) });
    hardFailure = true;
  }

  try {
    const bank = await syncInboundMailbox();
    steps.push({ name: "bank-email", status: bank.enabled ? "ok" : "skipped", summary: bank.enabled ? bank.summary || "Sběrný e-mail zkontrolován." : "Sběrný e-mail není zapnutý – krok přeskočen." });
  } catch (error) {
    const message = messageOf(error);
    if (isMailboxSetupSkip(message)) steps.push({ name: "bank-email", status: "skipped", summary: `${message} Krok byl bezpečně přeskočen.` });
    else { steps.push({ name: "bank-email", status: "failed", summary: message }); hardFailure = true; }
  }

  try {
    const retention = await cleanupInboundMailbox();
    steps.push({ name: "mailbox-retention", status: retention.enabled ? "ok" : "skipped", summary: retention.summary });
  } catch (error) {
    steps.push({ name: "mailbox-retention", status: "failed", summary: messageOf(error) });
  }

  try {
    const expired = await prisma.registrationRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    steps.push({ name: "registration-retention", status: "ok", summary: `Smazáno ${expired.count} propadlých registrací.` });
  } catch (error) {
    steps.push({ name: "registration-retention", status: "failed", summary: messageOf(error) });
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

  try {
    const tasks = await runTaskAutomation();
    steps.push({ name: "task-automation", status: "ok", summary: tasks.summary });
  } catch (error) {
    steps.push({ name: "task-automation", status: "failed", summary: messageOf(error) });
    hardFailure = true;
  }

  try {
    await collectTaskNotifications();
    const result = await processTaskNotifications();
    steps.push({ name: "task-notifications", status: result.failed ? "failed" : "ok", summary: `Odesláno ${result.sent}, přeskočeno ${result.skipped}, nepotvrzeno ${result.failed}.` });
  } catch (error) {
    steps.push({ name: "task-notifications", status: "failed", summary: messageOf(error) });
  }

  try {
    const mf = await syncMfRentDatasets();
    steps.push({ name: "mf-rent", status: mf.status === "skipped" ? "skipped" : "ok", summary: mf.summary });
  } catch (error) {
    steps.push({ name: "mf-rent", status: "failed", summary: `${messageOf(error)} Předchozí platná data zůstávají aktivní.` });
  }

  try {
    const csu = await syncCsuApartmentIndex();
    steps.push({ name: "csu-apartment-index", status: "ok", summary: `ČSÚ ${csu.latestQuarter.marketYear} Q${csu.latestQuarter.marketQuarter}: ${csu.newRows} nových a ${csu.correctedRows} opravených údajů.` });
  } catch (error) {
    steps.push({ name: "csu-apartment-index", status: "failed", summary: `${messageOf(error)} Starší ověřené údaje zůstávají aktivní.` });
  }

  try {
    const csu = await syncCsuApartmentAverage();
    steps.push({ name: "csu-apartment-average", status: "ok", summary: `ČSÚ ${csu.latestPeriod||"bez období"}: ${csu.newRows} nových a ${csu.correctedRows} opravených cen.` });
  } catch (error) {
    steps.push({ name: "csu-apartment-average", status: "failed", summary: `${messageOf(error)} Starší ověřené údaje zůstávají aktivní.` });
  }

  try {
    await captureSystemDailySnapshot();
    steps.push({ name: "system-statistics", status: "ok", summary: "Denní měření systému uloženo." });
  } catch (error) {
    steps.push({ name: "system-statistics", status: "failed", summary: messageOf(error) });
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
