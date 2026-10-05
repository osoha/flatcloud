import bcrypt from "bcryptjs";
import sharp from "sharp";
import { prisma } from "../db";
import { previewContext } from "../auth";
import {
  portalEditableUnitWhere,
  hasTenantPortalAccess,
} from "../tenant-portal-access";
import { createFileStorage } from "../storage";
import { sealSecret, openSecret } from "../secret";
import { leaseContractPilotEnabled } from "../lease-contract/pilot";
import { actionKind, actionMeanings, hashContent } from "./core";
import type { Prisma } from "@prisma/client";
export type ActionActor = {
  id: string;
  role: string;
  email: string;
  name: string;
  passwordHash: string;
  sessionVersion: number;
};
type Db = Prisma.TransactionClient;
export async function workflowActor() {
  if (!leaseContractPilotEnabled()) return null;
  const context = await previewContext();
  return context.requested ? null : context.actor;
}
export function packetInclude() {
  return {
    recipients: true,
    document: { include: { fileAsset: true } },
    lease: {
      include: {
        tenant: true,
        parties: {
          where: { role: "CONTRACTING_PARTY" as const },
          include: { tenant: true },
        },
        unit: { include: { property: true } },
      },
    },
  } as const;
}
export async function accessiblePacket(
  actor: ActionActor,
  id: string,
  db: Db = prisma,
) {
  const packet = await db.leaseActionPacket.findUnique({
    where: { id },
    include: packetInclude(),
  });
  if (!packet || packet.lease.cancelledAt) return null;
  const tenantIds = [
    packet.lease.tenantId,
    ...packet.lease.parties.map((p) => p.tenantId),
  ];
  const mine = [] as typeof packet.recipients;
  for (const r of packet.recipients) {
    if (
      r.staffUserId === actor.id &&
      (await db.unit.count({
        where: { id: packet.lease.unitId, ...portalEditableUnitWhere(actor) },
      }))
    )
      mine.push(r);
    else if (
      r.tenantId &&
      tenantIds.includes(r.tenantId) &&
      (await hasTenantPortalAccess(actor.id, actor.email, r.tenantId, db))
    )
      mine.push(r);
  }
  const manages =
    actor.role !== "TENANT" &&
    Boolean(
      await db.unit.count({
        where: { id: packet.lease.unitId, ...portalEditableUnitWhere(actor) },
      }),
    );
  return mine.length || manages ? { ...packet, mine, manages } : null;
}
export async function publishPacket(
  actor: ActionActor,
  leaseId: string,
  input: {
    kind: string;
    title: string;
    body: string;
    documentId?: string;
    staffSignerId?: string;
    authority?: string;
    dueDate?: string;
    confirmed: boolean;
  },
) {
  const kind = actionKind(input.kind),
    title = input.title.trim(),
    body = input.body.trim();
  if (
    !input.confirmed ||
    !title ||
    title.length > 200 ||
    !body ||
    body.length > 12000
  )
    throw new Error(
      "Zkontrolujte název, obsah a potvrďte předání konkrétním příjemcům.",
    );
  if (
    kind === "NON_RENEWAL" &&
    (/\[doplňte/i.test(body) || body.includes("Doplňte termín a kontakt"))
  )
    throw new Error(
      "Doplňte pronajímatele a konkrétní domluvu předání; oznámení obsahuje nevyplněné položky.",
    );
  const dueAt = input.dueDate ? new Date(input.dueDate + "T12:00:00Z") : null;
  if (
    dueAt &&
    (isNaN(+dueAt) || dueAt.toISOString().slice(0, 10) !== input.dueDate)
  )
    throw new Error("Neplatný termín.");
  return prisma.$transaction(async (db) => {
    const current = await db.user.findFirst({
      where: {
        id: actor.id,
        active: true,
        sessionVersion: actor.sessionVersion,
      },
      select: { id: true, role: true },
    });
    if (!current || current.role === "TENANT")
      throw new Error("Předání vyžaduje oprávnění správce.");
    const lease = await db.lease.findFirst({
      where: {
        id: leaseId,
        cancelledAt: null,
        unit: portalEditableUnitWhere(current),
      },
      include: {
        tenant: true,
        parties: {
          where: { role: "CONTRACTING_PARTY" },
          include: { tenant: true },
        },
        unit: { include: { property: true } },
      },
    });
    if (!lease) throw new Error("Nemáte oprávnění k této smlouvě.");
    if (kind === "NON_RENEWAL" && (!lease.endDate || lease.terminatedOn))
      throw new Error(
        "Neprodloužení je určeno pro nájem na dobu určitou bez předčasného ukončení.",
      );
    const tenants = [
      lease.tenant,
      ...lease.parties.map((p) => p.tenant),
    ].filter((t, i, a) => a.findIndex((v) => v.id === t.id) === i);
    if (tenants.some((t) => !t.active))
      throw new Error("Smluvní nájemník není aktivní.");
    let document = null;
    if (input.documentId) {
      document = await db.document.findFirst({
        where: {
          id: input.documentId,
          leaseId,
          propertyId: lease.unit.propertyId,
          OR: [{ unitId: null }, { unitId: lease.unitId }],
          deletedAt: null,
          taskEntryId: null,
          meterReadingEvidence: { none: {} },
        },
        include: { fileAsset: true },
      });
      if (!document || document.fileAsset.mimeType !== "application/pdf")
        throw new Error("Vyberte PDF přímo u této smlouvy.");
    }
    if (kind === "SIGN" && !document)
      throw new Error("K podpisu je nutné vybrat konkrétní PDF.");
    const recipients: Array<{
      participantKey: string;
      tenantId: string | null;
      staffUserId: string | null;
      expectedName: string;
      signerAuthority: string | null;
    }> = tenants.map((t) => ({
      participantKey: `tenant:${t.id}`,
      tenantId: t.id,
      staffUserId: null as string | null,
      expectedName: t.name,
      signerAuthority: null as string | null,
    }));
    if (kind === "SIGN") {
      if (!input.staffSignerId?.trim())
        throw new Error("Vyberte osobu podepisující za pronajímatele.");
      const authority = (input.authority || "").trim();
      if (!authority || authority.length > 350)
        throw new Error(
          "Doložte a popište oprávnění osoby podepisující za pronajímatele.",
        );
      const signer = await db.user.findFirst({
        where: {
          id: input.staffSignerId,
          active: true,
          role: { not: "TENANT" },
        },
        select: { id: true, name: true, role: true },
      });
      if (
        !signer ||
        !(await db.unit.count({
          where: { id: lease.unitId, ...portalEditableUnitWhere(signer) },
        }))
      )
        throw new Error(
          "Podepisující musí mít přístup k úpravě této jednotky.",
        );
      // Generated PDFs have an authoritative named signatory. An unrelated editor cannot sign as that person.
      const audit = await db.auditLog.findFirst({
        where: {
          entityType: "Document",
          entityId: document!.id,
          action: "DOCUMENT_UPLOADED",
        },
        orderBy: { createdAt: "desc" },
        select: { details: true },
      });
      const snap = audit?.details as {
        contractSnapshot?: { input?: { landlord?: { signer?: string } } };
      } | null;
      const declared = snap?.contractSnapshot?.input?.landlord?.signer;
      if (
        declared &&
        declared.trim().toLocaleLowerCase("cs") !==
          signer.name.trim().toLocaleLowerCase("cs")
      )
        throw new Error(
          `Ve smlouvě má za pronajímatele podepsat ${declared}. Vyberte účet této osoby nebo opravte dokument.`,
        );
      recipients.push({
        participantKey: `user:${signer.id}`,
        tenantId: null,
        staffUserId: signer.id,
        expectedName: signer.name,
        signerAuthority: authority,
      });
    }
    const sourceFileHash = document?.fileAsset.sha256 || null;
    const contentHash = hashContent(
      JSON.stringify({
        leaseId,
        kind,
        title,
        body,
        sourceFileHash,
        recipients,
      }),
    );
    const packet = await db.leaseActionPacket.create({
      data: {
        leaseId,
        documentId: document?.id,
        kind,
        title,
        body,
        contentHash,
        sourceFileHash,
        createdById: actor.id,
        createdByName: actor.name,
        dueAt,
        recipients: { create: recipients },
      },
    });
    await db.auditLog.create({
      data: {
        userId: actor.id,
        propertyId: lease.unit.propertyId,
        action: "LEASE_ACTION_PUBLISHED",
        entityType: "LeaseActionPacket",
        entityId: packet.id,
        details: {
          leaseId,
          kind,
          contentHash,
          documentId: document?.id || null,
          recipientKeys: recipients.map((r) => r.participantKey),
        },
      },
    });
    return packet;
  });
}
export async function savePersonalSignature(
  actor: ActionActor,
  png: string,
  password: string,
) {
  if (
    password.length > 200 ||
    !(await bcrypt.compare(password, actor.passwordHash))
  )
    throw new Error("Pro uložení vlastního podpisu zadejte správné heslo.");
  if (
    png.length > 1400000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)
  )
    throw new Error("Nakreslete vlastní podpis.");
  const source = Buffer.from(png.split(",")[1], "base64");
  const stats = await sharp(source, { limitInputPixels: 2000000 })
    .flatten({ background: "white" })
    .greyscale()
    .stats();
  if (stats.channels[0].min > 200 || stats.channels[0].stdev < 1)
    throw new Error("Podpis je prázdný.");
  const image = await sharp(source, { limitInputPixels: 2000000 })
    .resize({ width: 720, height: 220, fit: "inside" })
    .png()
    .toBuffer();
  await prisma.$transaction(async (db) => {
    const current = await db.user.findFirst({
      where: {
        id: actor.id,
        active: true,
        passwordHash: actor.passwordHash,
        sessionVersion: actor.sessionVersion,
      },
    });
    if (!current) throw new Error("Účet se změnil. Přihlaste se znovu.");
    await db.contractSignatureProfile.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        encryptedImage: sealSecret(image.toString("base64"))!,
        imageHash: hashContent(image),
      },
      update: {
        encryptedImage: sealSecret(image.toString("base64"))!,
        imageHash: hashContent(image),
        revision: { increment: 1 },
      },
    });
    await db.auditLog.create({
      data: {
        userId: actor.id,
        action: "CONTRACT_SIGNATURE_SAVED",
        entityType: "User",
        entityId: actor.id,
        details: { imageHash: hashContent(image) },
      },
    });
  });
}
export async function packetFile(
  packet: NonNullable<Awaited<ReturnType<typeof accessiblePacket>>>,
) {
  if (
    !packet.document ||
    packet.document.deletedAt ||
    packet.document.fileAsset.sha256 !== packet.sourceFileHash
  )
    throw new Error("Původní dokument není dostupný v potvrzované verzi.");
  const bytes = await createFileStorage().getObject(
    packet.document.fileAsset.storageKey,
  );
  if (hashContent(bytes) !== packet.sourceFileHash)
    throw new Error("Kontrola původního PDF selhala. Dokument nelze podepsat.");
  return bytes;
}
export async function completePacket(
  actor: ActionActor,
  id: string,
  input: { contentHash: string; password: string; accepted: boolean },
) {
  const before = await accessiblePacket(actor, id);
  if (!before || !before.mine.length)
    throw new Error("Tento úkon není určen vám.");
  if (
    !input.accepted ||
    input.contentHash !== before.contentHash ||
    before.cancelledAt
  )
    throw new Error("Otevřete aktuální obsah a výslovně potvrďte úkon.");
  const kind = actionKind(before.kind);
  if (before.document) await packetFile(before);
  if (
    kind === "SIGN" &&
    (input.password.length > 200 ||
      !(await bcrypt.compare(input.password, actor.passwordHash)))
  )
    throw new Error("Podpis potvrďte správným heslem svého účtu.");
  return prisma.$transaction(async (db) => {
    const user = await db.user.findFirst({
      where: {
        id: actor.id,
        active: true,
        passwordHash: actor.passwordHash,
        sessionVersion: actor.sessionVersion,
      },
    });
    if (!user) throw new Error("Účet se změnil. Přihlaste se znovu.");
    await db.$queryRaw`SELECT "id" FROM "LeaseActionPacket" WHERE "id" = ${id} FOR UPDATE`;
    const packet = await accessiblePacket(user, id, db);
    if (
      !packet ||
      packet.cancelledAt ||
      packet.contentHash !== input.contentHash ||
      !packet.mine.length
    )
      throw new Error("Přístup nebo dokument se změnil.");
    if (
      packet.document &&
      (packet.document.deletedAt ||
        packet.document.fileAsset.sha256 !== packet.sourceFileHash)
    )
      throw new Error("Dokument se změnil.");
    const signature =
      kind === "SIGN"
        ? await db.contractSignatureProfile.findUnique({
            where: { userId: actor.id },
          })
        : null;
    if (kind === "SIGN" && !signature)
      throw new Error("Nejdříve si v portálu uložte vlastní podpis.");
    const now = new Date();
    let completed = 0;
    for (const recipient of packet.mine) {
      if (recipient.completedAt) continue;
      const evidenceHash = hashContent(
        JSON.stringify({
          packetId: id,
          contentHash: packet.contentHash,
          recipientId: recipient.id,
          actorId: actor.id,
          name: user.name,
          email: user.email,
          action: actionMeanings[kind],
          completedAt: now.toISOString(),
          signatureHash: signature?.imageHash || null,
          method:
            kind === "SIGN" ? "ACCOUNT_PASSWORD" : "AUTHENTICATED_CONFIRMATION",
          authority: recipient.signerAuthority,
        }),
      );
      const result = await db.leaseActionRecipient.updateMany({
        where: {
          id: recipient.id,
          completedAt: null,
          packet: { cancelledAt: null },
        },
        data: {
          completedAt: now,
          openedAt: recipient.openedAt || now,
          completedById: actor.id,
          completedByName: user.name,
          completedByEmail: user.email,
          signatureEncrypted: signature?.encryptedImage || null,
          signatureHash: signature?.imageHash || null,
          evidenceHash,
        },
      });
      completed += result.count;
    }
    if (completed)
      await db.auditLog.create({
        data: {
          userId: actor.id,
          propertyId: packet.lease.unit.propertyId,
          action:
            kind === "SIGN"
              ? "LEASE_DOCUMENT_SIGNED"
              : "LEASE_ACTION_CONFIRMED",
          entityType: "LeaseActionPacket",
          entityId: id,
          details: {
            contentHash: packet.contentHash,
            kind,
            meaning: actionMeanings[kind],
            completedAt: now.toISOString(),
            method:
              kind === "SIGN"
                ? "ACCOUNT_PASSWORD"
                : "AUTHENTICATED_CONFIRMATION",
          },
        },
      });
    return { completed };
  });
}
export async function markPacketOpened(actor: ActionActor, id: string) {
  const packet = await accessiblePacket(actor, id);
  if (!packet) return null;
  for (const r of packet.mine)
    if (!r.openedAt)
      await prisma.leaseActionRecipient.updateMany({
        where: { id: r.id, openedAt: null },
        data: { openedAt: new Date() },
      });
  return packet;
}
export async function cancelPacket(actor: ActionActor, id: string) {
  await prisma.$transaction(async (db) => {
    const user = await db.user.findFirst({
      where: {
        id: actor.id,
        active: true,
        sessionVersion: actor.sessionVersion,
      },
    });
    if (!user) throw new Error("Účet se změnil. Přihlaste se znovu.");
    await db.$queryRaw`SELECT "id" FROM "LeaseActionPacket" WHERE "id" = ${id} FOR UPDATE`;
    const p = await accessiblePacket(user, id, db);
    if (!p?.manages) throw new Error("Nemáte oprávnění.");
    if (p.recipients.some((r) => r.completedAt))
      throw new Error(
        "Již potvrzený dokument nelze zrušit. Vytvořte navazující dokument.",
      );
    const result = await db.leaseActionPacket.updateMany({
      where: { id, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (result.count)
      await db.auditLog.create({
        data: {
          userId: actor.id,
          propertyId: p.lease.unit.propertyId,
          action: "LEASE_ACTION_CANCELLED",
          entityType: "LeaseActionPacket",
          entityId: id,
          details: { contentHash: p.contentHash },
        },
      });
  });
}
export function signatureImage(value: string) {
  return Buffer.from(openSecret(value)!, "base64");
}
export async function myPackets(actor: ActionActor) {
  const candidates = await prisma.leaseActionPacket.findMany({
    where: {
      OR: [
        { recipients: { some: { staffUserId: actor.id } } },
        {
          recipients: {
            some: {
              tenantId: {
                in: (
                  await prisma.tenantPortalAccess.findMany({
                    where: { userId: actor.id },
                    select: { tenantId: true },
                  })
                ).map((a) => a.tenantId),
              },
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true },
  });
  const packets = await Promise.all(
    candidates.map((p) => accessiblePacket(actor, p.id)),
  );
  return packets.filter((p): p is NonNullable<typeof p> =>
    Boolean(p && p.mine.length),
  );
}
