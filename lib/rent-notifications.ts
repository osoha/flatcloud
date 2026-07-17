import qrcode from "qrcode-generator";
import { NotificationStatus, NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "./db";
import { appSettings } from "./settings";
import { escapeHtml, sendMail } from "./email";
import { money, date } from "./format";
import { outstandingCents } from "./charges";
import { paymentIban } from "./owner-bank-account";

const pragueParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

function localParts(now = new Date()) {
  const values = Object.fromEntries(pragueParts.formatToParts(now).map((part) => [part.type, part.value]));
  return { key: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}
function utcDateFromKey(key: string) { return new Date(`${key}T00:00:00.000Z`); }
function addDays(key: string, days: number) { const d = utcDateFromKey(key); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
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

type LeaseRow = Prisma.LeaseGetPayload<{ include: { tenant: true; ownerBankAccount: { include: { owner: true } }; unit: { include: { ownerships: { include: { owner: true; ownerBankAccount: true } }; property: { include: { owner: true; communicationOwner: true; manager: true; bankAccounts: true } } } }; charges: { include: { allocations: true } } } }>;

async function record(input: { leaseId: string; chargeId?: string; type: NotificationType; status: NotificationStatus; recipient: string; subject: string; body: string; referenceKey: string; outstandingCents: number; messageId?: string; error?: string }) {
  return prisma.rentNotification.upsert({
    where: { leaseId_type_referenceDate: { leaseId: input.leaseId, type: input.type, referenceDate: utcDateFromKey(input.referenceKey) } },
    update: {},
    create: { leaseId: input.leaseId, chargeId: input.chargeId, type: input.type, status: input.status, recipient: input.recipient, subject: input.subject, body: input.body, referenceDate: utcDateFromKey(input.referenceKey), outstandingCents: input.outstandingCents, messageId: input.messageId, error: input.error, sentAt: input.status === "SENT" ? new Date() : null },
  });
}
async function already(leaseId: string, type: NotificationType, referenceKey: string) { return Boolean(await prisma.rentNotification.findUnique({ where: { leaseId_type_referenceDate: { leaseId, type, referenceDate: utcDateFromKey(referenceKey) } }, select: { id: true } })); }

async function tenantMessage(lease: LeaseRow, input: { type: NotificationType; referenceKey: string; chargeId?: string; subjectTemplate: string; bodyTemplate: string; amountCents: number; period: string; dueDate: Date; oldestDueDate: Date }) {
  if (await already(lease.id, input.type, input.referenceKey)) return "duplicate";
  const recipient = recipientFor(lease.tenant);
  const property = lease.unit.property;
  const unitOwnership = lease.unit.ownerships[0];
  const owner = lease.ownerBankAccount?.owner || unitOwnership?.owner || property.communicationOwner || property.owner;
  const iban = paymentIban(lease.ownerBankAccount || unitOwnership?.ownerBankAccount) || property.bankAccounts.find((account) => account.iban)?.iban || "";
  const values = { property: property.name, unit: lease.unit.label, tenant: lease.tenant.name, period: input.period, dueDate: date(input.dueDate), oldestDueDate: date(input.oldestDueDate), amount: money(input.amountCents), outstanding: money(input.amountCents), iban: iban || "neuveden", variableSymbol: lease.variableSymbol, owner: owner.name };
  const subject = fill(input.subjectTemplate, values);
  const body = fill(input.bodyTemplate, values);
  if (!recipient || !iban) {
    await record({ leaseId: lease.id, chargeId: input.chargeId, type: input.type, status: "SKIPPED", recipient: recipient || "", subject, body, referenceKey: input.referenceKey, outstandingCents: input.amountCents, error: !recipient ? "Nájemník nemá komunikační e-mail." : "U smlouvy ani vlastnictví jednotky není dostupný platební účet s IBAN." });
    return "skipped";
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
    return "sent";
  } catch (error) {
    await record({ leaseId: lease.id, chargeId: input.chargeId, type: input.type, status: "FAILED", recipient, subject, body, referenceKey: input.referenceKey, outstandingCents: input.amountCents, error: error instanceof Error ? error.message : "Neznámá chyba SMTP." });
    return "failed";
  }
}

async function internalAlert(lease: LeaseRow, type: NotificationType, referenceKey: string, outstanding: number, oldest: Date) {
  if (await already(lease.id, type, referenceKey)) return "duplicate";
  const property = lease.unit.property;
  const owner = lease.ownerBankAccount?.owner || lease.unit.ownerships[0]?.owner || property.communicationOwner || property.owner;
  const recipient = property.manager?.email || owner.email;
  const label = type === "MANAGER_ALERT" ? "Dluh vyžaduje kontrolu správce" : "Dluh vyžaduje ruční rozhodnutí o eskalaci";
  const subject = `${label} – ${property.name} / ${lease.unit.label}`;
  const body = `Nájemník: ${lease.tenant.name}\nAktuální dluh: ${money(outstanding)}\nNejstarší splatnost: ${date(oldest)}\nVariabilní symbol: ${lease.variableSymbol}\n\nPrávní krok ani výpověď nebyly automaticky provedeny.`;
  if (!recipient) { await record({ leaseId: lease.id, type, status: "SKIPPED", recipient: "", subject, body, referenceKey, outstandingCents: outstanding, error: "Není nastaven e-mail správce ani vlastníka." }); return "skipped"; }
  try {
    const result = await sendMail({ to: recipient, subject, text: `${owner.name}\n\n${body}`, html: mailLayout(owner, subject, body) });
    if (!result.sent) throw new Error(result.reason);
    await record({ leaseId: lease.id, type, status: "SENT", recipient, subject, body, referenceKey, outstandingCents: outstanding, messageId: result.messageId }); return "sent";
  } catch (error) { await record({ leaseId: lease.id, type, status: "FAILED", recipient, subject, body, referenceKey, outstandingCents: outstanding, error: error instanceof Error ? error.message : "Neznámá chyba SMTP." }); return "failed"; }
}

export async function runRentNotifications(now = new Date(), force = false) {
  const settings = await appSettings();
  const local = localParts(now);
  await prisma.appSetting.update({ where: { id: "global" }, data: { lastReminderCronStartedAt: now } });
  if (!settings.remindersEnabled) return finish("Automatické zprávy k nájmu jsou vypnuté.");
  if (!force && local.hour !== settings.reminderSendHour) return finish(`Mimo nastavenou hodinu odesílání (${settings.reminderSendHour}:00).`);
  const leases = await prisma.lease.findMany({
    where: { status: { in: ["ACTIVE", "ENDED"] }, charges: { some: { active: true } } },
    include: {
      tenant: true,
      ownerBankAccount: { include: { owner: true } },
      unit: { include: { ownerships: { include: { owner: true, ownerBankAccount: true }, orderBy: { createdAt: "asc" } }, property: { include: { owner: true, communicationOwner: true, manager: true, bankAccounts: true } } } },
      charges: { where: { active: true }, include: { allocations: true }, orderBy: { dueDate: "asc" } },
    },
  });
  const counts = { sent: 0, failed: 0, skipped: 0, duplicate: 0 };
  for (const lease of leases) {
    if (lease.remindersPausedUntil && dateKey(lease.remindersPausedUntil) >= local.key) continue;
    for (const charge of lease.charges) {
      const remaining = outstandingCents(charge);
      if (!remaining) continue;
      if (addDays(dateKey(charge.dueDate), -settings.paymentNoticeDaysBefore) === local.key) bump(counts, await tenantMessage(lease, { type: "PAYMENT_NOTICE", referenceKey: local.key, chargeId: charge.id, subjectTemplate: settings.paymentNoticeSubject, bodyTemplate: settings.paymentNoticeBody, amountCents: remaining, period: charge.period, dueDate: charge.dueDate, oldestDueDate: charge.dueDate }));
    }
    const overdue = lease.charges.filter((c) => dateKey(c.dueDate) < local.key && outstandingCents(c) > 0);
    if (!overdue.length) continue;
    const total = overdue.reduce((sum, c) => sum + outstandingCents(c), 0);
    const oldest = overdue[0];
    const oldestKey = dateKey(oldest.dueDate);
    if (addDays(oldestKey, settings.firstReminderDaysAfter) === local.key) bump(counts, await tenantMessage(lease, { type: "FIRST_REMINDER", referenceKey: local.key, subjectTemplate: settings.firstReminderSubject, bodyTemplate: settings.firstReminderBody, amountCents: total, period: oldest.period, dueDate: oldest.dueDate, oldestDueDate: oldest.dueDate }));
    if (addDays(oldestKey, settings.secondReminderDaysAfter) === local.key) bump(counts, await tenantMessage(lease, { type: "SECOND_REMINDER", referenceKey: local.key, subjectTemplate: settings.secondReminderSubject, bodyTemplate: settings.secondReminderBody, amountCents: total, period: oldest.period, dueDate: oldest.dueDate, oldestDueDate: oldest.dueDate }));
    if (addDays(oldestKey, settings.managerAlertDaysAfter) === local.key) bump(counts, await internalAlert(lease, "MANAGER_ALERT", local.key, total, oldest.dueDate));
    if (addDays(oldestKey, settings.escalationDaysAfter) === local.key) bump(counts, await internalAlert(lease, "ESCALATION", local.key, total, oldest.dueDate));
  }
  return finish(`Odesláno: ${counts.sent}; chyby: ${counts.failed}; přeskočeno: ${counts.skipped}; již zpracováno: ${counts.duplicate}.`);
}
function bump(counts: Record<string, number>, result: string) { if (result in counts) counts[result] += 1; }
async function finish(summary: string) { await prisma.appSetting.update({ where: { id: "global" }, data: { lastReminderCronFinishedAt: new Date(), lastReminderCronSummary: summary } }); console.log(summary); return summary; }
