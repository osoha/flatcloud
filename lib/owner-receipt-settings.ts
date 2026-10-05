import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { previewContext } from "./auth";
import { portalEditableUnitWhere } from "./tenant-portal-access";
import { serializableTransaction } from "./serializable";

export type ReceiptActor = { id: string; role: string; allProperties?: boolean };
export async function receiptRequestActor() {
  const context = await previewContext();
  if (context.requested || !context.actor) throw new Error("Tato akce není dostupná v náhledu jiného uživatele.");
  return context.actor;
}
export async function currentReceiptActor(actor: ReceiptActor, db: Prisma.TransactionClient = prisma) {
  const user = await db.user.findFirst({ where: { id: actor.id, active: true }, select: { id: true, role: true, allProperties: true } });
  if (!user || user.role === "TENANT") throw new Error("K této akci nemáte oprávnění.");
  return user;
}
async function ownerManagement(actor: ReceiptActor, ownerId: string, db: Prisma.TransactionClient) {
  const user = await currentReceiptActor(actor, db), owner = await db.owner.findUnique({ where: { id: ownerId }, select: { id: true, name: true, address: true, userId: true, active: true, type: true, user: { select: { name: true, active: true, receiptIssuanceEnabled: true, receiptSignatureData: true } } } });
  if (!owner) return null;
  const canManage = ["SUPER_ADMIN", "MANAGER"].includes(user.role) || owner.userId === user.id;
  return { user, owner, canManage };
}
async function requireOwnerManagement(actor: ReceiptActor, ownerId: string, db: Prisma.TransactionClient) {
  const result = await ownerManagement(actor, ownerId, db);
  if (!result?.canManage) throw new Error("Nemáte oprávnění nastavovat vystavování za tohoto vlastníka.");
  return result;
}
const representativeSelect = { id: true, ownerId: true, userId: true, roleLabel: true, active: true, signatureHash: true, consentProfileRevision: true, consentedAt: true, revokedAt: true, createdAt: true, updatedAt: true, user: { select: { id: true, name: true, email: true, active: true } } } as const;
export async function getOwnerReceiptSettings(actor: ReceiptActor, ownerId: string) {
  return serializableTransaction(async tx => {
    const scope = await ownerManagement(actor, ownerId, tx);
    if (!scope) return null;
    if (!scope.canManage && !await tx.ownerRepresentative.count({ where: { ownerId, userId: scope.user.id } })) return null;
    const [profile, rows] = await Promise.all([
      tx.ownerReceiptProfile.findUnique({ where: { ownerId }, include: { designatedRepresentative: { select: representativeSelect } } }),
      tx.ownerRepresentative.findMany({ where: { ownerId, ...(scope.canManage ? {} : { userId: scope.user.id }) }, select: representativeSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);
    const selected = profile?.designatedRepresentative;
    const personal = scope.owner.type === "PERSON";
    const ready = Boolean(scope.owner.active && profile?.enabled && (personal ? scope.owner.user?.active && scope.owner.user.receiptIssuanceEnabled && scope.owner.user.receiptSignatureData?.byteLength : selected?.ownerId === ownerId && selected.active && selected.user.active && selected.signatureHash && selected.consentedAt && !selected.revokedAt && selected.consentProfileRevision === profile.revision));
    const publicProfile = profile ? (() => { const { designatedRepresentative: _privateSelected, stampData: _privateStamp, ...safe } = profile; return { ...safe, hasStamp: Boolean(profile.stampData), designatedRepresentativeName: personal ? scope.owner.user?.name || null : selected?.user.name || null }; })() : null;
    const { user: _privateOwnerUser, ...publicOwner } = scope.owner;
    return { owner: publicOwner, canManage: scope.canManage, profile: publicProfile, status: { ready, reason: ready ? "Vystavování je připravené." : personal ? !scope.owner.userId ? "K fyzické osobě je třeba propojit její vlastní účet." : "Pronajímatel uloží svůj podpis a zapne vystavování ve svém účtu." : "Zkontrolujte zapnutí vystavování a osobní souhlas určeného zástupce." }, representatives: rows.map(row => ({ ...row, hasSignature: Boolean(row.signatureHash), canConsent: row.userId === actor.id && row.active && row.user.active && scope.owner.active, canRevoke: row.userId === actor.id && Boolean(row.consentedAt && !row.revokedAt), consentCurrent: Boolean(row.active && row.user.active && row.consentedAt && !row.revokedAt && row.signatureHash && row.consentProfileRevision === profile?.revision) })) };
  });
}
export async function getMyOwnerReceiptSettings(actor: ReceiptActor) {
  const user = await currentReceiptActor(actor);
  const rows = await prisma.owner.findMany({ where: { OR: [{ userId: user.id }, { representatives: { some: { userId: user.id } } }] }, select: { id: true, name: true, userId: true }, orderBy: { name: "asc" } });
  return rows.map(owner => ({ id: owner.id, name: owner.name, canManage: ["SUPER_ADMIN", "MANAGER"].includes(user.role) || owner.userId === user.id }));
}

export async function receiptStampFromForm(form: FormData) {
  const file = form.get("stamp");
  if (!(file instanceof File) || !file.size) return undefined;
  if (file.size > 2 * 1024 * 1024) throw new Error("Razítko může mít nejvýše 2 MB.");
  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { limitInputPixels: 12000000 });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new Error("Razítko musí být PNG, JPG nebo WebP.");
  const normalized = await image.rotate().resize({ width: 800, height: 400, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return new Uint8Array(normalized);
}
export async function saveOwnerReceiptProfile(actor: ReceiptActor, ownerId: string, input: { revision: string; issuerName: string; issuerAddress: string; enabled: boolean; designatedRepresentativeId?: string; stamp?: Uint8Array; removeStamp?: boolean }) {
  const issuerName = input.issuerName.trim(), issuerAddress = input.issuerAddress.trim();
  if (!issuerName || issuerName.length > 160 || !issuerAddress || issuerAddress.length > 240) throw new Error("Vyplňte název vystavitele do 160 a adresu do 240 znaků.");
  return serializableTransaction(async tx => {
    const { user, owner } = await requireOwnerManagement(actor, ownerId, tx);
    const previous = await tx.ownerReceiptProfile.findUnique({ where: { ownerId } });
    if (input.revision !== (previous?.updatedAt.toISOString() || "new")) throw new Error("Nastavení se změnilo. Obnovte stránku.");
    const available = owner.type === "PERSON" ? [] : await tx.ownerRepresentative.findMany({ where: { ownerId, active: true, user: { active: true, role: { not: "TENANT" } } }, select: { id: true }, take: 2 });
    const designatedRepresentativeId = owner.type === "PERSON" ? null : input.designatedRepresentativeId || previous?.designatedRepresentativeId || (available.length === 1 ? available[0].id : null);
    if (designatedRepresentativeId && !await tx.ownerRepresentative.count({ where: { id: designatedRepresentativeId, ownerId, active: true, user: { active: true, role: { not: "TENANT" } } } })) throw new Error("Vyberte aktivní osobu jednající právě za tohoto vlastníka.");
    const identityChanged = Boolean(previous && (previous.issuerName !== issuerName || previous.issuerAddress !== issuerAddress));
    const stampData = input.removeStamp ? null : input.stamp || previous?.stampData || null;
    const stampHash = stampData ? createHash("sha256").update(stampData).digest("hex") : null;
    const data = { issuerName, issuerAddress, enabled: input.enabled, designatedRepresentativeId, stampData, stampHash, updatedById: user.id, revision: (previous?.revision || 1) + (identityChanged ? 1 : 0) };
    const profile = await tx.ownerReceiptProfile.upsert({ where: { ownerId }, create: { ownerId, ...data }, update: data });
    if (identityChanged && designatedRepresentativeId) {
      const rep = await tx.ownerRepresentative.findUnique({ where: { id: designatedRepresentativeId }, select: { userId: true } });
      if (rep) await tx.task.upsert({ where: { dedupeKey: `owner-receipt-consent:${designatedRepresentativeId}` }, create: { title: `Potvrdit zastoupení pro doklady · ${owner.name}`, description: `Údaje vystavitele se změnily. Potvrďte svůj podpis znovu: /vlastnici/${ownerId}/doklady#doklady-a-podpisy`, category: "GENERAL", status: "OPEN", assigneeId: rep.userId, createdById: user.id, dedupeKey: `owner-receipt-consent:${designatedRepresentativeId}` }, update: { status: "OPEN", closedAt: null, assigneeId: rep.userId } });
    }
    await tx.auditLog.create({ data: { userId: user.id, action: "OWNER_RECEIPT_PROFILE_CONFIGURED", entityType: "OwnerReceiptProfile", entityId: ownerId, details: { before: previous ? { issuerName: previous.issuerName, issuerAddress: previous.issuerAddress, enabled: previous.enabled, revision: previous.revision, designatedRepresentativeId: previous.designatedRepresentativeId, stampHash: previous.stampHash } : null, after: { issuerName, issuerAddress, enabled: input.enabled, designatedRepresentativeId, stampHash, revision: data.revision }, existingConsentsInvalidated: identityChanged } } });
    return profile;
  });
}
export async function saveOwnerRepresentative(actor: ReceiptActor, ownerId: string, input: { action: string; userEmail?: string; representativeId?: string; revision?: string; roleLabel?: string; active: boolean }) {
  const roleLabel = input.roleLabel?.trim() || null;
  if (roleLabel && roleLabel.length > 120) throw new Error("Označení oprávnění může mít nejvýše 120 znaků.");
  return serializableTransaction(async tx => {
    const { user, owner } = await requireOwnerManagement(actor, ownerId, tx);
    if (owner.type === "PERSON") throw new Error("Fyzická osoba používá svůj vlastní podpis uložený v účtu.");
    let row;
    if (input.action === "add") {
      const email = input.userEmail?.trim().toLowerCase();
      const representative = email ? await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, active: true, role: { not: "TENANT" } }, select: { id: true } }) : null;
      if (!representative) throw new Error("Aktivní uživatelský účet s tímto e-mailem nebyl nalezen.");
      if (await tx.ownerRepresentative.count({ where: { ownerId, userId: representative.id } })) throw new Error("Tato osoba už je evidována. Upravte její existující zastoupení.");
      row = await tx.ownerRepresentative.create({ data: { ownerId, userId: representative.id, roleLabel, active: input.active, createdById: user.id } });
      if (row.active) await tx.ownerReceiptProfile.updateMany({ where: { ownerId, designatedRepresentativeId: null }, data: { designatedRepresentativeId: row.id } });
    } else if (input.action === "update") {
      const previous = await tx.ownerRepresentative.findFirst({ where: { id: input.representativeId || "", ownerId } });
      if (!previous || previous.updatedAt.toISOString() !== input.revision) throw new Error("Zastoupení se změnilo. Obnovte stránku.");
      // Changes to the capacity in which someone signs, and every deactivation, require a new personal consent.
      const invalidate = !input.active || previous.roleLabel !== roleLabel;
      row = await tx.ownerRepresentative.update({ where: { id: previous.id }, data: { active: input.active, roleLabel, ...(invalidate ? { revokedAt: new Date() } : {}) } });
    } else throw new Error("Neplatná akce.");
    await tx.auditLog.create({ data: { userId: user.id, action: "OWNER_REPRESENTATIVE_CONFIGURED", entityType: "OwnerRepresentative", entityId: row.id, details: { ownerId, representativeUserId: row.userId, active: row.active, roleLabel: row.roleLabel, personalConsentGranted: false } } });
    if (row.active && (input.action === "add" || input.action === "update" && row.revokedAt)) {
      await tx.task.upsert({ where: { dedupeKey: `owner-receipt-consent:${row.id}` }, create: { title: `Potvrdit zastoupení pro doklady · ${owner.name}`, description: `Otevřete nastavení dokladů a potvrďte oprávnění i svůj podpis: /vlastnici/${ownerId}/doklady#doklady-a-podpisy`, category: "GENERAL", priority: "NORMAL", status: "OPEN", assigneeId: row.userId, createdById: user.id, dedupeKey: `owner-receipt-consent:${row.id}`, entries: { create: { kind: "SYSTEM", body: "Po potvrzení oprávnění a podpisu se tento úkol automaticky uzavře." } } }, update: { status: "OPEN", closedAt: null, assigneeId: row.userId } });
    }
    return row.id;
  });
}

export async function ownReceiptSignatureFromForm(actor: ReceiptActor, form: FormData) {
  let source: Buffer | undefined;
  const drawn = String(form.get("drawnSignature") || ""), file = form.get("signature");
  if (drawn) {
    if (drawn.length > 2800000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(drawn)) throw new Error("Neplatný obrázek podpisu.");
    source = Buffer.from(drawn.split(",")[1], "base64");
  } else if (file instanceof File && file.size) {
    if (file.size > 2 * 1024 * 1024) throw new Error("Podpis může mít nejvýše 2 MB.");
    source = Buffer.from(await file.arrayBuffer());
  } else if (form.get("useSavedSignature") === "on") {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { receiptSignatureData: true } });
    if (user.receiptSignatureData) source = Buffer.from(user.receiptSignatureData);
  }
  if (!source) throw new Error("Vložte svůj podpis nebo výslovně zvolte použití vlastního uloženého podpisu.");
  const image = sharp(source, { limitInputPixels: 12000000 }), metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new Error("Podpis musí být PNG, JPG nebo WebP.");
  const stats = await sharp(source, { limitInputPixels: 12000000 }).flatten({ background: "white" }).greyscale().stats();
  if (stats.channels[0].min > 200 || stats.channels[0].stdev < 1) throw new Error("Obrázek neobsahuje čitelný podpis.");
  return new Uint8Array(await image.rotate().resize({ width: 900, height: 300, fit: "inside", withoutEnlargement: true }).png().toBuffer());
}
export async function consentOwnerReceiptSignature(actor: ReceiptActor, ownerId: string, representativeId: string, input: { revision: string; profileRevision: number; action: string; authorization: boolean; signature?: Uint8Array }) {
  return serializableTransaction(async tx => {
    const user = await currentReceiptActor(actor, tx);
    const rep = await tx.ownerRepresentative.findFirst({ where: { id: representativeId, ownerId, userId: user.id }, include: { owner: { select: { active: true } } } });
    if (!rep || input.revision !== rep.updatedAt.toISOString()) throw new Error("Souhlas může změnit pouze uvedená osoba ve svém účtu. Obnovte stránku.");
    const profile = await tx.ownerReceiptProfile.findUnique({ where: { ownerId } });
    if (input.action === "consent") {
      if (!rep.active || !rep.owner.active || !profile || profile.revision !== input.profileRevision) throw new Error("Zastoupení nebo údaje vystavitele se změnily. Obnovte stránku.");
      if (!input.authorization || !input.signature?.byteLength) throw new Error("Potvrďte své oprávnění a použití vlastního podpisu za tohoto vystavitele.");
      const signatureHash = createHash("sha256").update(input.signature).digest("hex");
      await tx.ownerRepresentative.update({ where: { id: rep.id }, data: { signatureData: new Uint8Array(input.signature), signatureHash, consentProfileRevision: profile.revision, consentedAt: new Date(), revokedAt: null } });
      await tx.ownerReceiptProfile.updateMany({ where: { ownerId, designatedRepresentativeId: null }, data: { designatedRepresentativeId: rep.id } });
      await tx.task.updateMany({ where: { dedupeKey: `owner-receipt-consent:${rep.id}`, status: { not: "DONE" } }, data: { status: "DONE", closedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user.id, action: "OWNER_RECEIPT_SIGNATURE_CONSENTED", entityType: "OwnerRepresentative", entityId: rep.id, details: { ownerId, representativeUserId: user.id, issuerName: profile.issuerName, issuerAddress: profile.issuerAddress, roleLabel: rep.roleLabel, profileRevision: profile.revision, signatureHash } } });
    } else if (input.action === "revoke") {
      await tx.ownerRepresentative.update({ where: { id: rep.id }, data: { revokedAt: new Date() } });
      await tx.task.updateMany({ where: { dedupeKey: `owner-receipt-consent:${rep.id}` }, data: { status: "OPEN", closedAt: null } });
      await tx.auditLog.create({ data: { userId: user.id, action: "OWNER_RECEIPT_SIGNATURE_REVOKED", entityType: "OwnerRepresentative", entityId: rep.id, details: { ownerId, representativeUserId: user.id } } });
    } else throw new Error("Neplatná akce.");
  });
}

export async function receiptLandlordChoices(actor: ReceiptActor, leaseId: string, db: Prisma.TransactionClient = prisma) {
  const user = await currentReceiptActor(actor, db);
  const lease = leaseId ? await db.lease.findFirst({ where: { id: leaseId, unit: portalEditableUnitWhere(user) }, select: { unitId: true, unit: { select: { propertyId: true } } } }) : null;
  const linked: Prisma.OwnerWhereInput[] = lease ? [{ unitOwnerships: { some: { unitId: lease.unitId } } }, { properties: { some: { id: lease.unit.propertyId, ownershipMode: "WHOLE_OBJECT" } } }, { paymentAccounts: { some: { leases: { some: { id: leaseId } } } } }] : [];
  if (!lease) return [];
  const rows = await db.owner.findMany({ where: { active: true, ...(["SUPER_ADMIN", "MANAGER"].includes(user.role) ? {} : { OR: [{ userId: user.id }, ...linked] }) }, select: { id: true, name: true, userId: true, representatives: { where: { userId: user.id }, select: { id: true } } }, orderBy: { name: "asc" } });
  return rows.map(owner => ({ id: owner.id, name: owner.name, canConfigure: ["SUPER_ADMIN", "MANAGER"].includes(user.role) || owner.userId === user.id, canViewSettings: ["SUPER_ADMIN", "MANAGER"].includes(user.role) || owner.userId === user.id || owner.representatives.length > 0 }));
}
export async function saveLeaseLandlordPeriod(actor: ReceiptActor, leaseId: string, input: { action: string; periodId?: string; revision?: string; ownerId: string; fromPeriod: string; toPeriod?: string; active: boolean }) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/, toPeriod = input.toPeriod || null;
  if (!month.test(input.fromPeriod) || toPeriod && (!month.test(toPeriod) || toPeriod < input.fromPeriod)) throw new Error("Zadejte platný rozsah období ve tvaru RRRR-MM.");
  return serializableTransaction(async tx => {
    const user = await currentReceiptActor(actor, tx);
    const lease = await tx.lease.findFirst({ where: { id: leaseId, unit: portalEditableUnitWhere(user) }, select: { id: true, unit: { select: { propertyId: true } } } });
    if (!lease) throw new Error("Nemáte oprávnění měnit pronajímatele této smlouvy.");
    if (!(await receiptLandlordChoices(user, leaseId, tx)).some(owner => owner.id === input.ownerId)) throw new Error("Vybraný pronajímatel není dostupný pro tuto smlouvu. Jinou firmu může potvrdit její vlastní účet nebo globální správce.");
    const previous = input.action === "update" ? await tx.leaseLandlordPeriod.findFirst({ where: { id: input.periodId || "", leaseId } }) : null;
    if (input.action !== "add" && input.action !== "update") throw new Error("Neplatná akce.");
    if (input.action === "update" && (!previous || previous.updatedAt.toISOString() !== input.revision)) throw new Error("Období se změnilo. Obnovte stránku.");
    if (input.active && await tx.leaseLandlordPeriod.count({ where: { leaseId, active: true, ...(previous ? { id: { not: previous.id } } : {}), ...(toPeriod ? { fromPeriod: { lte: toPeriod } } : {}), OR: [{ toPeriod: null }, { toPeriod: { gte: input.fromPeriod } }] } })) throw new Error("Potvrzená období pronajímatelů se nesmějí překrývat. Nejprve upravte konec předchozího období.");
    const data = { ownerId: input.ownerId, fromPeriod: input.fromPeriod, toPeriod, active: input.active, confirmedById: user.id };
    const row = previous ? await tx.leaseLandlordPeriod.update({ where: { id: previous.id }, data }) : await tx.leaseLandlordPeriod.create({ data: { leaseId, ...data } });
    await tx.auditLog.create({ data: { userId: user.id, propertyId: lease.unit.propertyId, action: "LEASE_LANDLORD_CONFIRMED", entityType: "LeaseLandlordPeriod", entityId: row.id, details: { leaseId, before: previous ? { ownerId: previous.ownerId, fromPeriod: previous.fromPeriod, toPeriod: previous.toPeriod, active: previous.active } : null, after: data, paymentRecipientChanged: false } } });
    return row;
  });
}

export function assertReceiptWriteRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || new URL(request.url).searchParams.has("preview")) throw new Error("Tato akce není dostupná v náhledu ani z jiného webu.");
}
export async function leaseReceiptReturnPath(leaseId: string, value: FormDataEntryValue | null) {
  const fallback = `/smlouvy/${leaseId}#doklady`;
  if (value === fallback) return fallback;
  const lease = await prisma.lease.findUnique({ where: { id: leaseId }, select: { unitId: true, unit: { select: { propertyId: true } } } });
  const unit = lease ? `/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}#doklady` : null;
  return typeof value === "string" && unit && value === unit ? unit : fallback;
}
