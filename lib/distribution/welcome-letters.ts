import { ownerVisibleDocumentWhere } from "../documents/access";
import type { Prisma } from "@prisma/client";
import { canSeeAll } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escapeHtml, sendMail } from "@/lib/email";
import { createFileStorage } from "@/lib/storage";

type Actor = { id: string; role: string; allProperties?: boolean };
export type WelcomeLetterStatus = "DRAFT" | "READY" | "SENDING" | "SENT" | "ARCHIVED";
export const welcomeLetterStatuses: Record<WelcomeLetterStatus, string> = { DRAFT: "Koncept", READY: "Připraveno", SENDING: "Odesílá se", SENT: "Odesláno", ARCHIVED: "Archivováno" };
export const welcomeSectionFields = [
  ["handoverText", "Předání nemovitosti"], ["leaseText", "Nájemní smlouva a platební údaje"], ["insuranceText", "Pojištění nemovitosti"],
  ["managementText", "Správa nemovitosti"], ["platformText", "Evidence a FlatCloud Rent"], ["taxText", "Zdanění příjmu a odpisy"],
  ["associationText", "Společenství vlastníků jednotek"],
] as const;
type SectionField = typeof welcomeSectionFields[number][0];
export type WelcomeLetterDraftInput = { recipientEmail: string; ownershipRegisteredAt: Date; subject: string; introduction: string; closingText: string; contactText: string; documentIds: string[] } & Record<SectionField, string>;

function assertInternal(actor: Actor) { if (!canSeeAll(actor.role)) throw new Error("Uvítací dopisy jsou dostupné pouze interním správcům FlatCloud."); }
function required(value: string, label: string, max = 20_000) { const trimmed = value.trim(); if (!trimmed) throw new Error(`Doplňte pole ${label}.`); if (trimmed.length > max) throw new Error(`${label} je příliš dlouhé.`); return trimmed; }
function email(value: string) { const normalized = value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Doplňte platný e-mail nového vlastníka."); return normalized; }
function paragraphs(value: string) { return value.split(/\n{2,}/).map((part) => `<p style="margin:0 0 14px">${escapeHtml(part.trim()).replace(/\n/g, "<br>")}</p>`).join(""); }

export function defaultWelcomeLetterContent(input: { recipientName: string; propertyName: string; propertyAddress: string; unitLabel: string; sellerName: string; sellerEmail?: string | null; sellerPhone?: string | null }) {
  return {
    subject: `Vítejte mezi vlastníky – ${input.propertyName}, ${input.unitLabel}`,
    introduction: `Vážená paní, vážený pane,\n\ndovolte nám, abychom vás jménem týmu FlatCloud přivítali jako nového vlastníka jednotky ${input.unitLabel} v nemovitosti ${input.propertyName} na adrese ${input.propertyAddress}. Děkujeme za vaši důvěru. Tento e-mail shrnuje důležité kroky po dokončení převodu a kontakty, které můžete v dalších týdnech potřebovat.`,
    handoverText: "Pro řádné předání je potřeba zkontrolovat jednotku, zapsat stavy měřidel a potvrdit počet předaných klíčů. Při předání obdržíte související dokumenty, zejména předávací protokol, stavy měřidel, informace o službách, odpadech, parkování a pravidlech domu.",
    leaseText: "Je-li jednotka pronajatá, je po změně vlastníka potřeba zkontrolovat nájemní dokumentaci, platební předpis a údaje účtu pro nájemné a zálohy. Podle situace připravíme novou smlouvu nebo dodatek a zajistíme informování nájemce. Prosíme o potvrzení vašich fakturačních a bankovních údajů zabezpečeným dohodnutým kanálem; neposílejte citlivé údaje odpovědí na tento e-mail, pokud jsme se nedohodli jinak.",
    insuranceText: "Doporučujeme bez prodlení ověřit pojištění nemovitosti včetně odpovědnosti vlastníka. Pojištění domácnosti si zpravidla sjednává nájemce. Pokud bylo pojištění podmínkou hypotečního financování, zkontrolujte zejména správnost identifikace jednotky a počátek krytí.",
    managementText: "Pokud chcete nemovitost držet jako pasivní investici, můžeme vám představit rozsah navazující správy: komunikaci s nájemcem, evidenci plateb, vyúčtování služeb, přípravu změn nájemného, obsazování, revize a provozní údržbu. Konkrétní rozsah, cenu a odpovědnosti vždy stanoví samostatná smlouva o správě.",
    platformText: "Pro přehled o pronájmu doporučujeme využívat FlatCloud Rent. Na jednom místě lze sledovat smlouvy, předpisy a platby, měřidla, dokumenty, úkoly, revize a podklady pro vyúčtování. Přístup a oprávnění vám nastavíme podle zvoleného modelu správy.",
    taxText: "Příjmy z pronájmu a související náklady doporučujeme konzultovat s daňovým poradcem. Ten posoudí vhodný způsob evidence skutečných výdajů, odpisování a přípravy daňového přiznání s ohledem na vaši individuální situaci a případné bankovní financování.",
    associationText: "Informace o existujícím nebo připravovaném společenství vlastníků, správci domu, zálohách a plánovaných rozhodnutích doplníme podle aktuální situace v konkrétním domě. Pokud bude potřeba váš souhlas nebo účast, obdržíte samostatné podklady.",
    closingText: "Věříme, že se podaří všechny navazující kroky dokončit hladce a že vám investice bude přinášet očekávaný užitek. V případě dotazů jsme vám k dispozici.\n\nS pozdravem\ntým FlatCloud",
    contactText: `${input.sellerName}\n${[input.sellerEmail, input.sellerPhone].filter(Boolean).join(" · ") || "Kontaktní údaje doplňte před odesláním."}`,
  };
}

export function renderWelcomeLetter(input: { subject: string; introduction: string; closingText: string; contactText: string } & Record<SectionField, string>) {
  const sections = welcomeSectionFields.filter(([field]) => input[field].trim()).map(([field, label]) => `<section style="margin:0 0 22px"><h2 style="margin:0 0 8px;color:#173d6f;font-size:18px">${escapeHtml(label)}</h2>${paragraphs(input[field])}</section>`).join("");
  const html = `<div style="margin:0;background:#f4f7fb;padding:24px 10px;font-family:Arial,sans-serif;color:#17233a;line-height:1.55"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #dbe4f0"><div style="padding:24px 30px;background:#173d6f;color:#fff"><div style="font-size:26px;font-weight:700">FlatCloud</div><div style="margin-top:5px;color:#c9dcf2">Průvodce nového vlastníka</div></div><div style="padding:30px">${paragraphs(input.introduction)}${sections}${paragraphs(input.closingText)}<div style="margin-top:24px;padding-top:18px;border-top:1px solid #dbe4f0;color:#53647a;font-size:13px">${paragraphs(input.contactText)}</div></div></div></div>`;
  const text = [input.introduction, ...welcomeSectionFields.flatMap(([field, label]) => input[field].trim() ? [`${label}\n${input[field]}`] : []), input.closingText, `Kontakty\n${input.contactText}`].join("\n\n");
  return { html, text };
}

export async function createWelcomeLetter(actor: Actor, input: { opportunityId: string; ownershipRegisteredAt: Date }) {
  assertInternal(actor);
  if (Number.isNaN(input.ownershipRegisteredAt.getTime())) throw new Error("Doplňte datum nabytí podle katastru.");
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.distributionOpportunity.findFirst({ where: { id: input.opportunityId, stage: "WON", unit: { property: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 } } } }, include: { prospect: true, unit: { include: { property: { include: { owner: true } } } }, welcomeLetters: { orderBy: { revision: "desc" }, take: 1 } } });
    if (!opportunity) throw new Error("Dopis lze založit pouze k uzavřenému prodeji v potvrzeném aktivu FlatCloud.");
    if (!opportunity.prospect.email) throw new Error("Nový vlastník nemá v CRM vyplněný e-mail.");
    if (opportunity.welcomeLetters[0] && !["SENT", "ARCHIVED"].includes(opportunity.welcomeLetters[0].status)) throw new Error("K tomuto prodeji již existuje rozpracovaný uvítací dopis.");
    const property = opportunity.unit.property, owner = property.owner;
    const content = defaultWelcomeLetterContent({ recipientName: opportunity.prospect.name, propertyName: property.name, propertyAddress: property.address, unitLabel: opportunity.unit.label, sellerName: owner.name, sellerEmail: owner.email, sellerPhone: owner.phone });
    const letter = await tx.distributionWelcomeLetter.create({ data: { opportunityId: opportunity.id, propertyId: property.id, sellerOwnerId: owner.id, revision: (opportunity.welcomeLetters[0]?.revision || 0) + 1, recipientNameSnapshot: opportunity.prospect.name, recipientEmail: email(opportunity.prospect.email), propertyNameSnapshot: property.name, propertyAddressSnapshot: property.address, unitLabelSnapshot: opportunity.unit.label, sellerNameSnapshot: owner.name, ownershipRegisteredAt: input.ownershipRegisteredAt, ...content, createdById: actor.id, updatedById: actor.id } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: property.id, action: "DISTRIBUTION_WELCOME_LETTER_CREATED", entityType: "DistributionWelcomeLetter", entityId: letter.id, details: { opportunityId: opportunity.id, revision: letter.revision, hasRecipientEmail: true, ownershipRegisteredAt: input.ownershipRegisteredAt.toISOString(), templateVersion: letter.templateVersion } } });
    return letter;
  });
}

async function validDocuments(client: Prisma.TransactionClient, propertyId: string, documentIds: string[]) {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (ids.length > 8) throw new Error("K jednomu dopisu lze připojit nejvýše 8 dokumentů.");
  const documents = await client.document.findMany({ where: { id: { in: ids }, propertyId, deletedAt: null, AND: [ownerVisibleDocumentWhere] }, select: { id: true } });
  if (documents.length !== ids.length) throw new Error("Některá příloha nepatří k vybranému domu nebo již není dostupná.");
  return ids;
}

export async function updateWelcomeLetter(actor: Actor, id: string, input: WelcomeLetterDraftInput) {
  assertInternal(actor);
  return prisma.$transaction(async (tx) => {
    const current = await tx.distributionWelcomeLetter.findUnique({ where: { id }, select: { id: true, propertyId: true, status: true } });
    if (!current || current.status !== "DRAFT") throw new Error("Upravovat lze pouze koncept uvítacího dopisu.");
    const documentIds = await validDocuments(tx, current.propertyId, input.documentIds);
    const data = { recipientEmail: email(input.recipientEmail), ownershipRegisteredAt: input.ownershipRegisteredAt, subject: required(input.subject, "Předmět", 300), introduction: required(input.introduction, "Úvod"), handoverText: input.handoverText.trim(), leaseText: input.leaseText.trim(), insuranceText: input.insuranceText.trim(), managementText: input.managementText.trim(), platformText: input.platformText.trim(), taxText: input.taxText.trim(), associationText: input.associationText.trim(), closingText: required(input.closingText, "Závěr"), contactText: required(input.contactText, "Kontakty"), updatedById: actor.id };
    if (Number.isNaN(data.ownershipRegisteredAt.getTime())) throw new Error("Doplňte datum nabytí podle katastru.");
    await tx.distributionWelcomeLetterAttachment.deleteMany({ where: { welcomeLetterId: id } });
    if (documentIds.length) await tx.distributionWelcomeLetterAttachment.createMany({ data: documentIds.map((documentId, sortOrder) => ({ welcomeLetterId: id, documentId, sortOrder })) });
    const letter = await tx.distributionWelcomeLetter.update({ where: { id }, data });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: current.propertyId, action: "DISTRIBUTION_WELCOME_LETTER_UPDATED", entityType: "DistributionWelcomeLetter", entityId: id, details: { attachmentCount: documentIds.length, hasRecipientEmail: true, ownershipRegisteredAt: input.ownershipRegisteredAt.toISOString() } } });
    return letter;
  });
}

export async function setWelcomeLetterReady(actor: Actor, id: string) {
  assertInternal(actor);
  return prisma.$transaction(async (tx) => {
    const letter = await tx.distributionWelcomeLetter.findFirst({ where: { id, status: "DRAFT" }, include: { attachments: { include: { document: { select: { deletedAt: true } } } } } });
    if (!letter) throw new Error("Ke kontrole lze předat pouze koncept.");
    email(letter.recipientEmail); required(letter.subject, "Předmět"); required(letter.introduction, "Úvod"); required(letter.closingText, "Závěr"); required(letter.contactText, "Kontakty");
    if (letter.attachments.some(({ document }) => document.deletedAt)) throw new Error("Jedna z příloh již není dostupná.");
    const updated = await tx.distributionWelcomeLetter.update({ where: { id }, data: { status: "READY", readyById: actor.id, readyAt: new Date(), updatedById: actor.id } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: letter.propertyId, action: "DISTRIBUTION_WELCOME_LETTER_READY", entityType: "DistributionWelcomeLetter", entityId: id, details: { revision: letter.revision, attachmentCount: letter.attachments.length } } });
    return updated;
  });
}

export async function reopenWelcomeLetter(actor: Actor, id: string) {
  assertInternal(actor);
  const letter = await prisma.distributionWelcomeLetter.findFirst({ where: { id, status: "READY" }, select: { propertyId: true } });
  if (!letter) throw new Error("K úpravám lze vrátit pouze připravený dopis.");
  return prisma.$transaction(async (tx) => { const updated = await tx.distributionWelcomeLetter.update({ where: { id }, data: { status: "DRAFT", readyById: null, readyAt: null, updatedById: actor.id } }); await tx.auditLog.create({ data: { userId: actor.id, propertyId: letter.propertyId, action: "DISTRIBUTION_WELCOME_LETTER_REOPENED", entityType: "DistributionWelcomeLetter", entityId: id } }); return updated; });
}

export async function sendWelcomeLetter(actor: Actor, id: string) {
  assertInternal(actor);
  const claimed = await prisma.$transaction(async (tx) => {
    const letter = await tx.distributionWelcomeLetter.findFirst({ where: { id, status: "READY", opportunity: { stage: "WON" } }, include: { attachments: { orderBy: { sortOrder: "asc" }, include: { document: { include: { fileAsset: true } } } } } });
    if (!letter) throw new Error("Odeslat lze pouze zkontrolovaný dopis k uzavřenému prodeji.");
    if (letter.ownershipRegisteredAt > new Date()) throw new Error("Datum nabytí podle katastru ještě nenastalo.");
    if (letter.attachments.some(({ document }) => document.deletedAt || document.fileAsset.deletedAt)) throw new Error("Jedna z příloh již není dostupná.");
    const lock = await tx.distributionWelcomeLetter.updateMany({ where: { id, status: "READY" }, data: { status: "SENDING", sendingStartedAt: new Date(), updatedById: actor.id } });
    if (lock.count !== 1) throw new Error("Dopis již zpracovává jiný uživatel.");
    return letter;
  });
  let acceptedByProvider = false;
  try {
    const storage = createFileStorage();
    const attachments = await Promise.all(claimed.attachments.map(async ({ document }) => ({ filename: document.fileAsset.originalName, content: Buffer.from(await storage.getObject(document.fileAsset.storageKey)), contentType: document.fileAsset.mimeType })));
    if (attachments.reduce((sum, item) => sum + item.content.byteLength, 0) > 20 * 1024 * 1024) throw new Error("Přílohy překračují bezpečný limit 20 MB.");
    const rendered = renderWelcomeLetter(claimed);
    const result = await sendMail({ to: claimed.recipientEmail, subject: claimed.subject, ...rendered, attachments });
    if (!result.sent) throw new Error(result.reason);
    acceptedByProvider = true;
    return await prisma.$transaction(async (tx) => { const sentAt = new Date(); const updated = await tx.distributionWelcomeLetter.update({ where: { id }, data: { status: "SENT", sentAt, sentById: actor.id, providerMessageId: result.messageId, updatedById: actor.id } }); await tx.auditLog.create({ data: { userId: actor.id, propertyId: claimed.propertyId, action: "DISTRIBUTION_WELCOME_LETTER_SENT", entityType: "DistributionWelcomeLetter", entityId: id, details: { revision: claimed.revision, attachmentCount: attachments.length, sentAt: sentAt.toISOString(), providerMessageId: result.messageId } } }); return updated; });
  } catch (error) {
    if (!acceptedByProvider) await prisma.$transaction(async (tx) => { await tx.distributionWelcomeLetter.updateMany({ where: { id, status: "SENDING" }, data: { status: "READY", sendingStartedAt: null, updatedById: actor.id } }); await tx.auditLog.create({ data: { userId: actor.id, propertyId: claimed.propertyId, action: "DISTRIBUTION_WELCOME_LETTER_SEND_FAILED", entityType: "DistributionWelcomeLetter", entityId: id, details: { reason: error instanceof Error ? error.message.slice(0, 500) : "unknown" } } }); });
    throw error;
  }
}
