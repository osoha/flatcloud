import qrcode from "qrcode-generator";
import { NotificationStatus, NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "./db";
import { appSettings } from "./settings";
import { escapeHtml, sendMail } from "./email";
import { money, date } from "./format";
import { outstandingCents } from "./charges";
import { paymentIban } from "./owner-bank-account";
import { ensureCollectionTask } from "./tasks";

const pragueParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function localParts(now = new Date()) {
  const values = Object.fromEntries(pragueParts.formatToParts(now).map((part) => [part.type, part.value]));
  return { key: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}
function utcDateFromKey(key: string) { return new Date(`${key}T00:00:00.000Z`); }
function addDays(key: string, days: number) { const d = utcDateFromKey(key); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
function compareKeys(a: string, b: string) { return a.localeCompare(b); }
function daysBetween(fromKey: string, toKey: string) { return Math.max(0, Math.floor((utcDateFromKey(toKey).getTime() - utcDateFromKey(fromKey).getTime()) / 86_400_000)); }
function fill(template: string, values: Record<string, string>) { return template.replace(/{{\s*([A-Za-z]+)\s*}}/g, (_, key) => values[key] ?? `{{${key}}}`); }
function textToHtml(text: string) { return escapeHtml(text).replace(/\n/g, "<br>"); }
function recipientFor(tenant: { type: string; email: string | null; communicationEmail: string | null; billingEmail: string | null }) { return tenant.type === "COMPANY" ? tenant.communicationEmail || tenant.billingEmail || tenant.email : tenant.email; }
function ownerHeader(owner: { name: string; ico: string | null; address: string | null; email: string | null; phone: string | null }) {
  return `<div style="padding:18px 20px;background:#f4f7fb;border-bottom:1px solid #dbe4f0"><strong style="font-size:18px;color:#102348">${escapeHtml(owner.name)}</strong>${owner.ico ? `<div>IČO: ${escapeHtml(owner.ico)}</div>` : ""}${owner.address ? `<div>${escapeHtml(owner.address)}</div>` : ""}<div>${[owner.email, owner.phone].filter(Boolean).map((v) => escapeHtml(v!)).join(" · ")}</div></div>`;
}
function mailLayout(owner: Parameters<typeof ownerHeader>[0], title: string, body: string, qrSource?: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#17233a;max-width:680px;margin:auto;border:1px solid #dbe4f0;border-radius:12px;overflow:hidden">${ownerHeader(owner)}<div style="padding:24px"><h2 style="margin-top:0">${escapeHtml(title)}</h2><div>${textToHtml(body)}</div>${qrSource ? `<div style="margin-top:22px"><p><strong>QR platba</strong></p><img src="${qrSource}" width="220" height="220" alt="QR kód pro platbu" style="display:block;border:1px solid #e2e8f0;border-radius:8px"></div>` : ""}<p style="margin-top:24px;color:#64748b;font-size:13px">Tato zpráva byla vytvořena systémem FlatCloud Rent.</p></div></div>`;
}
function spd(iban: string, amountCents: number, variableSymbol: string, message: string) {
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  const amount = (amountCents / 100).toFixed(2);
  return `SPD*1.0*ACC:${cleanIban}*AM:${amount}*CC:CZK*X-VS:${variableSymbol}*MSG:${message.replace(/[\r\n*]/g, " ").slice(0, 60)}`;
}

export const rentNotificationLabels: Record<NotificationType, string> = {
  PAYMENT_NOTICE: "Platební údaje",
  FIRST_REMINDER: "1. upozornění",
  SECOND_REMINDER: "2. upomínka",
  MANAGER_ALERT: "Upozornění správci",
  ESCALATION: "Ruční eskalace",
};

export type NotificationRunMode = "scheduled" | "manual" | "force";
type DeliveryState = "sent" | "failed" | "skipped" | "duplicate";
export type NotificationRunItem = {
  leaseId: string;
  property: string;
  unit: string;
  tenant: string;
  type: NotificationType;
  typeLabel: string;
  status: DeliveryState;
  recipient: string;
  referenceDate: string;
  outstandingCents: number;
  detail?: string;
};
export type NotificationRunResult = {
  mode: NotificationRunMode;
  summary: string;
  counts: { sent: number; failed: number; skipped: number; duplicate: number };
  items: NotificationRunItem[];
};
export type ForceReminderCandidate = {
  leaseId: string;
  propertyId: string;
  property: string;
  unit: string;
  tenant: string;
  recipient: string;
  chargeCount: number;
  outstandingCents: number;
  oldestDueDate: Date;
  daysOverdue: number;
  type: "FIRST_REMINDER" | "SECOND_REMINDER";
  typeLabel: string;
  referenceDate: string;
};
export type ForceReminderPreview = {
  candidates: ForceReminderCandidate[];
  leaseCount: number;
  chargeCount: number;
  outstandingCents: number;
};

type LeaseRow = Prisma.LeaseGetPayload<{ include: { tenant: true; ownerBankAccount: { include: { owner: true } }; unit: { include: { ownerships: { include: { owner: true; ownerBankAccount: true } }; property: { include: { owner: true; communicationOwner: true; manager: true; bankAccounts: true } } } }; charges: { include: { allocations: true; securityDepositOffsets: true; creditApplications: true } } } }>;

async function loadLeases() {
  return prisma.lease.findMany({
    where: { unit: { property: { active: true } }, charges: { some: { active: true } } },
    include: {
      tenant: true,
      ownerBankAccount: { include: { owner: true } },
      unit: { include: { ownerships: { include: { owner: true, ownerBankAccount: true }, orderBy: { createdAt: "asc" } }, property: { include: { owner: true, communicationOwner: true, manager: true, bankAccounts: true } } } },
      charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } },
    },
  });
}

async function record(input: { leaseId: string; chargeId?: string; type: NotificationType; status: NotificationStatus; recipient: string; subject: string; body: string; referenceKey: string; outstandingCents: number; messageId?: string; error?: string }) {
  const sentAt = input.status === "SENT" ? new Date() : null;
  return prisma.rentNotification.upsert({
    where: { leaseId_type_referenceDate: { leaseId: input.leaseId, type: input.type, referenceDate: utcDateFromKey(input.referenceKey) } },
    update: { chargeId: input.chargeId, status: input.status, recipient: input.recipient, subject: input.subject, body: input.body, outstandingCents: input.outstandingCents, messageId: input.messageId || null, error: input.error || null, sentAt },
    create: { leaseId: input.leaseId, chargeId: input.chargeId, type: input.type, status: input.status, recipient: input.recipient, subject: input.subject, body: input.body, referenceDate: utcDateFromKey(input.referenceKey), outstandingCents: input.outstandingCents, messageId: input.messageId, error: input.error, sentAt },
  });
}
async function alreadySent(leaseId: string, type: NotificationType, referenceKey: string) {
  return Boolean(await prisma.rentNotification.findFirst({ where: { leaseId, type, referenceDate: utcDateFromKey(referenceKey), status: "SENT" }, select: { id: true } }));
}

function outcomeBase(lease: LeaseRow, type: NotificationType, referenceKey: string, amountCents: number) {
  return { leaseId: lease.id, property: lease.unit.property.name, unit: lease.unit.label, tenant: lease.tenant.name, type, typeLabel: rentNotificationLabels[type], referenceDate: referenceKey, outstandingCents: amountCents };
}

async function tenantMessage(lease: LeaseRow, input: { type: NotificationType; referenceKey: string; chargeId?: string; subjectTemplate: string; bodyTemplate: string; amountCents: number; period: string; dueDate: Date; oldestDueDate: Date }): Promise<NotificationRunItem> {
  const base = outcomeBase(lease, input.type, input.referenceKey, input.amountCents);
  if (await alreadySent(lease.id, input.type, input.referenceKey)) return { ...base, status: "duplicate", recipient: recipientFor(lease.tenant) || "", detail: "Tento stupeň již byl úspěšně odeslán." };
  const recipient = recipientFor(lease.tenant);
  const property = lease.unit.property;
  const unitOwnership = lease.unit.ownerships[0];
  const owner = lease.ownerBankAccount?.owner || unitOwnership?.owner || property.communicationOwner || property.owner;
  const iban = paymentIban(lease.ownerBankAccount || unitOwnership?.ownerBankAccount) || property.bankAccounts.find((account) => account.iban)?.iban || "";
  const values = { property: property.name, unit: lease.unit.label, tenant: lease.tenant.name, period: input.period, dueDate: date(input.dueDate), oldestDueDate: date(input.oldestDueDate), amount: money(input.amountCents), outstanding: money(input.amountCents), iban: iban || "neuveden", variableSymbol: lease.variableSymbol, owner: owner.name };
  const subject = fill(input.subjectTemplate, values);
  const body = fill(input.bodyTemplate, values);
  if (!recipient || !iban) {
    const error = !recipient ? "Nájemník nemá komunikační e-mail." : "U smlouvy ani vlastnictví jednotky není dostupný platební účet s IBAN.";
    await record({ leaseId: lease.id, chargeId: input.chargeId, type: input.type, status: "SKIPPED", recipient: recipient || "", subject, body, referenceKey: input.referenceKey, outstandingCents: input.amountCents, error });
    return { ...base, status: "skipped", recipient: recipient || "", detail: error };
  }
  try {
    const qr = qrcode(0, "M");
    qr.addData(spd(iban, input.amountCents, lease.variableSymbol, `${property.name} ${lease.unit.label}`));
    qr.make();
    const qrDataUrl = qr.createDataURL(6, 12);
    const qrPayload = qrDataUrl.split(",")[1];
    if (!qrPayload) throw new Error("QR kód se nepodařilo vytvořit.");
    const qrCid = `rent-payment-${lease.id}-${input.referenceKey}@flatcloud-rent`;
    const result = await sendMail({
      to: recipient,
      subject,
      text: `${owner.name}\n${[owner.ico ? `IČO ${owner.ico}` : "", owner.address || ""].filter(Boolean).join("\n")}\n\n${body}`,
      html: mailLayout(owner, subject, body, `cid:${qrCid}`),
      attachments: [{ filename: "qr-platba.gif", content: Buffer.from(qrPayload, "base64"), cid: qrCid, contentType: "image/gif" }],
    });
    if (!result.sent) throw new Error(result.reason);
    await record({ leaseId: lease.id, chargeId: input.chargeId, type: input.type, status: "SENT", recipient, subject, body, referenceKey: input.referenceKey, outstandingCents: input.amountCents, messageId: result.messageId });
    if (input.type === "FIRST_REMINDER" || input.type === "SECOND_REMINDER") {
      await ensureCollectionTask({
        leaseId: lease.id,
        period: input.period,
        outstandingCents: input.amountCents,
        event: `${rentNotificationLabels[input.type]} odesláno nájemníkovi na ${recipient}. Evidovaný dluh: ${money(input.amountCents)}.`,
        kind: "EMAIL",
        priority: input.type === "SECOND_REMINDER" ? "URGENT" : "HIGH",
      });
    }
    return { ...base, status: "sent", recipient };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Neznámá chyba SMTP.";
    await record({ leaseId: lease.id, chargeId: input.chargeId, type: input.type, status: "FAILED", recipient, subject, body, referenceKey: input.referenceKey, outstandingCents: input.amountCents, error: detail });
    return { ...base, status: "failed", recipient, detail };
  }
}

async function internalAlert(lease: LeaseRow, type: NotificationType, referenceKey: string, outstanding: number, oldest: Date): Promise<NotificationRunItem> {
  const base = outcomeBase(lease, type, referenceKey, outstanding);
  const property = lease.unit.property;
  const owner = lease.ownerBankAccount?.owner || lease.unit.ownerships[0]?.owner || property.communicationOwner || property.owner;
  const recipient = property.manager?.email || owner.email || "";
  if (await alreadySent(lease.id, type, referenceKey)) return { ...base, status: "duplicate", recipient, detail: "Tento stupeň již byl úspěšně odeslán." };
  const label = type === "MANAGER_ALERT" ? "Dluh vyžaduje kontrolu správce" : "Dluh vyžaduje ruční rozhodnutí o eskalaci";
  const subject = `${label} – ${property.name} / ${lease.unit.label}`;
  const body = `Nájemník: ${lease.tenant.name}\nAktuální dluh: ${money(outstanding)}\nNejstarší splatnost: ${date(oldest)}\nVariabilní symbol: ${lease.variableSymbol}\n\nPrávní krok ani výpověď nebyly automaticky provedeny.`;
  if (!recipient) {
    const error = "Není nastaven e-mail správce ani vlastníka.";
    await record({ leaseId: lease.id, type, status: "SKIPPED", recipient: "", subject, body, referenceKey, outstandingCents: outstanding, error });
    return { ...base, status: "skipped", recipient: "", detail: error };
  }
  try {
    const result = await sendMail({ to: recipient, subject, text: `${owner.name}\n\n${body}`, html: mailLayout(owner, subject, body) });
    if (!result.sent) throw new Error(result.reason);
    await record({ leaseId: lease.id, type, status: "SENT", recipient, subject, body, referenceKey, outstandingCents: outstanding, messageId: result.messageId });
    await ensureCollectionTask({
      leaseId: lease.id,
      period: oldest.toISOString().slice(0, 7),
      outstandingCents: outstanding,
      event: `${label}. Interní upozornění odesláno na ${recipient}. Evidovaný dluh: ${money(outstanding)}.`,
      kind: "SYSTEM",
      priority: type === "ESCALATION" ? "URGENT" : "HIGH",
    });
    return { ...base, status: "sent", recipient };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Neznámá chyba SMTP.";
    await record({ leaseId: lease.id, type, status: "FAILED", recipient, subject, body, referenceKey, outstandingCents: outstanding, error: detail });
    return { ...base, status: "failed", recipient, detail };
  }
}

function paused(lease: LeaseRow, localKey: string) { return Boolean(lease.remindersPausedUntil && dateKey(lease.remindersPausedUntil) >= localKey); }
function overdueCharges(lease: LeaseRow, localKey: string) { return lease.charges.filter((c) => dateKey(c.dueDate) < localKey && outstandingCents(c) > 0); }
function totalOutstanding(charges: LeaseRow["charges"]) { return charges.reduce((sum, charge) => sum + outstandingCents(charge), 0); }

async function nextForcedTenantStage(lease: LeaseRow, localKey: string, settings: Awaited<ReturnType<typeof appSettings>>) {
  if (paused(lease, localKey)) return null;
  const overdue = overdueCharges(lease, localKey);
  if (!overdue.length) return null;
  const oldest = overdue[0];
  const oldestKey = dateKey(oldest.dueDate);
  const firstKey = addDays(oldestKey, settings.firstReminderDaysAfter);
  if (!(await alreadySent(lease.id, "FIRST_REMINDER", firstKey))) return { type: "FIRST_REMINDER" as const, referenceKey: firstKey, overdue, oldest };
  const secondKey = addDays(oldestKey, settings.secondReminderDaysAfter);
  if (!(await alreadySent(lease.id, "SECOND_REMINDER", secondKey))) return { type: "SECOND_REMINDER" as const, referenceKey: secondKey, overdue, oldest };
  return null;
}

export async function previewForceRentNotifications(now = new Date()): Promise<ForceReminderPreview> {
  const [settings, leases] = await Promise.all([appSettings(), loadLeases()]);
  const local = localParts(now);
  const candidates: ForceReminderCandidate[] = [];
  for (const lease of leases) {
    const candidate = await nextForcedTenantStage(lease, local.key, settings);
    if (!candidate) continue;
    const amount = totalOutstanding(candidate.overdue);
    candidates.push({
      leaseId: lease.id,
      propertyId: lease.unit.property.id,
      property: lease.unit.property.name,
      unit: lease.unit.label,
      tenant: lease.tenant.name,
      recipient: recipientFor(lease.tenant) || "",
      chargeCount: candidate.overdue.length,
      outstandingCents: amount,
      oldestDueDate: candidate.oldest.dueDate,
      daysOverdue: daysBetween(dateKey(candidate.oldest.dueDate), local.key),
      type: candidate.type,
      typeLabel: rentNotificationLabels[candidate.type],
      referenceDate: candidate.referenceKey,
    });
  }
  return {
    candidates,
    leaseCount: candidates.length,
    chargeCount: candidates.reduce((sum, item) => sum + item.chargeCount, 0),
    outstandingCents: candidates.reduce((sum, item) => sum + item.outstandingCents, 0),
  };
}

export async function runRentNotifications(now = new Date(), requestedMode: NotificationRunMode | boolean = "scheduled"): Promise<NotificationRunResult> {
  const mode: NotificationRunMode = typeof requestedMode === "boolean" ? (requestedMode ? "manual" : "scheduled") : requestedMode;
  const settings = await appSettings();
  const local = localParts(now);
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastReminderCronStartedAt: now } });
  if (mode !== "force" && !settings.remindersEnabled) return finish(mode, emptyCounts(), [], "Automatické zprávy k nájmu jsou vypnuté.");
  if (mode === "scheduled" && local.hour !== settings.reminderSendHour) return finish(mode, emptyCounts(), [], `Mimo nastavenou hodinu odesílání (${settings.reminderSendHour}:00).`);

  const leases = await loadLeases();
  const counts = emptyCounts();
  const items: NotificationRunItem[] = [];

  for (const lease of leases) {
    if (paused(lease, local.key)) continue;

    if (mode === "force") {
      const candidate = await nextForcedTenantStage(lease, local.key, settings);
      if (!candidate) continue;
      const total = totalOutstanding(candidate.overdue);
      const outcome = candidate.type === "FIRST_REMINDER"
        ? await tenantMessage(lease, { type: "FIRST_REMINDER", referenceKey: candidate.referenceKey, subjectTemplate: settings.firstReminderSubject, bodyTemplate: settings.firstReminderBody, amountCents: total, period: candidate.oldest.period, dueDate: candidate.oldest.dueDate, oldestDueDate: candidate.oldest.dueDate })
        : await tenantMessage(lease, { type: "SECOND_REMINDER", referenceKey: candidate.referenceKey, subjectTemplate: settings.secondReminderSubject, bodyTemplate: settings.secondReminderBody, amountCents: total, period: candidate.oldest.period, dueDate: candidate.oldest.dueDate, oldestDueDate: candidate.oldest.dueDate });
      addOutcome(counts, items, outcome);
      continue;
    }

    for (const charge of lease.charges) {
      const remaining = outstandingCents(charge);
      if (!remaining) continue;
      const dueKey = dateKey(charge.dueDate);
      const paymentNoticeKey = addDays(dueKey, -settings.paymentNoticeDaysBefore);
      // Zmeškané platební údaje doženeme pouze do splatnosti. Po splatnosti už patří do upomínkového toku.
      if (compareKeys(paymentNoticeKey, local.key) <= 0 && compareKeys(local.key, dueKey) <= 0) {
        addOutcome(counts, items, await tenantMessage(lease, { type: "PAYMENT_NOTICE", referenceKey: paymentNoticeKey, chargeId: charge.id, subjectTemplate: settings.paymentNoticeSubject, bodyTemplate: settings.paymentNoticeBody, amountCents: remaining, period: charge.period, dueDate: charge.dueDate, oldestDueDate: charge.dueDate }));
      }
    }

    const overdue = overdueCharges(lease, local.key);
    if (!overdue.length) continue;
    const total = totalOutstanding(overdue);
    const oldest = overdue[0];
    const oldestKey = dateKey(oldest.dueDate);
    const firstKey = addDays(oldestKey, settings.firstReminderDaysAfter);
    const secondKey = addDays(oldestKey, settings.secondReminderDaysAfter);
    const managerKey = addDays(oldestKey, settings.managerAlertDaysAfter);
    const escalationKey = addDays(oldestKey, settings.escalationDaysAfter);

    // Milníky jsou stabilní vůči datu splatnosti. Pokud cron některý den neběžel, pozdější kontrola jej dožene.
    if (compareKeys(firstKey, local.key) <= 0) addOutcome(counts, items, await tenantMessage(lease, { type: "FIRST_REMINDER", referenceKey: firstKey, subjectTemplate: settings.firstReminderSubject, bodyTemplate: settings.firstReminderBody, amountCents: total, period: oldest.period, dueDate: oldest.dueDate, oldestDueDate: oldest.dueDate }));
    if (compareKeys(secondKey, local.key) <= 0) addOutcome(counts, items, await tenantMessage(lease, { type: "SECOND_REMINDER", referenceKey: secondKey, subjectTemplate: settings.secondReminderSubject, bodyTemplate: settings.secondReminderBody, amountCents: total, period: oldest.period, dueDate: oldest.dueDate, oldestDueDate: oldest.dueDate }));
    if (compareKeys(managerKey, local.key) <= 0) addOutcome(counts, items, await internalAlert(lease, "MANAGER_ALERT", managerKey, total, oldest.dueDate));
    if (compareKeys(escalationKey, local.key) <= 0) addOutcome(counts, items, await internalAlert(lease, "ESCALATION", escalationKey, total, oldest.dueDate));
  }

  const summary = `${mode === "force" ? "Vynucené rozeslání" : mode === "manual" ? "Ruční kontrola" : "Automatická kontrola"}: odesláno ${counts.sent}; chyby ${counts.failed}; přeskočeno ${counts.skipped}; již odesláno ${counts.duplicate}.`;
  return finish(mode, counts, items, summary);
}

function emptyCounts() { return { sent: 0, failed: 0, skipped: 0, duplicate: 0 }; }
function addOutcome(counts: ReturnType<typeof emptyCounts>, items: NotificationRunItem[], outcome: NotificationRunItem) {
  counts[outcome.status] += 1;
  items.push(outcome);
}
async function finish(mode: NotificationRunMode, counts: ReturnType<typeof emptyCounts>, items: NotificationRunItem[], summary: string): Promise<NotificationRunResult> {
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastReminderCronFinishedAt: new Date(), lastReminderCronSummary: summary } });
  console.log(summary);
  for (const item of items.filter((value) => value.status === "failed" || value.status === "skipped")) console.error(`[rent-notification] ${item.status} ${item.type} ${item.property}/${item.unit}: ${item.detail || "bez detailu"}`);
  return { mode, summary, counts, items };
}
