import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../lib/db";
import { consentOwnerReceiptSignature, getMyOwnerReceiptSettings, getOwnerReceiptSettings, receiptLandlordChoices, saveLeaseLandlordPeriod, saveOwnerReceiptProfile, saveOwnerRepresentative } from "../lib/owner-receipt-settings";
import { getLeaseReceiptDocuments, issueStaffReceipt, issueTenantReceipt, receiptIssuerStatusForLease, staffReceiptArchive } from "../lib/tenant-payment-receipts";

let checks = 0;
async function check(name: string, work: () => Promise<void>) { await work(); console.log(`✓ ${++checks}. ${name}`); }
async function main() {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  const tag = `OWNER_RECEIPT_${randomUUID()}`;
  const person = (suffix: string, role: "MANAGER" | "OWNER_VIEWER" | "PROPERTY_MANAGER" | "TENANT", extra = {}) => prisma.user.create({ data: { name: `${tag}_${suffix}`, email: `${tag}_${suffix}@flatcloud.test`, passwordHash: "synthetic-only", role, isTestIdentity: true, ...extra } });
  const admin = await person("admin", "MANAGER"), signer = await person("signer", "OWNER_VIEWER"), editor = await person("editor", "PROPERTY_MANAGER"), viewer = await person("readonly", "OWNER_VIEWER", { allProperties: true }), outsider = await person("outsider", "PROPERTY_MANAGER"), tenantUser = await person("tenant", "TENANT");
  const users = [admin, signer, editor, viewer, outsider, tenantUser];
  const owners = await Promise.all(["A", "B", "BANK"].map(name => prisma.owner.create({ data: { name: `${tag}_${name}`, address: "Testovací 12, Praha" } })));
  const [ownerA, ownerB, bankOwner] = owners;
  const properties = await Promise.all([ownerA, ownerB].map(owner => prisma.property.create({ data: { name: owner.name, ownerId: owner.id, address: "Testovací 12", city: "Praha", managerId: editor.id } })));
  const units = await Promise.all(properties.map((property, index) => prisma.unit.create({ data: { propertyId: property.id, label: `${index + 1}`, ownerships: { create: { ownerId: owners[index].id, shareBasisPoints: 10000 } }, userAccesses: { create: { userId: editor.id, permission: "EDIT" } } } })));
  const tenant = await prisma.tenant.create({ data: { name: tenantUser.name, email: tenantUser.email } });
  const bankAccount = await prisma.ownerBankAccount.create({ data: { ownerId: bankOwner.id, accountNumber: "123456789", bankCode: "0100" } });
  const secondAccount = await prisma.ownerBankAccount.create({ data: { ownerId: ownerB.id, accountNumber: "987654321", bankCode: "0100" } });
  const leases = await Promise.all(units.map((unit, index) => prisma.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, ownerBankAccountId: index ? secondAccount.id : bankAccount.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: `${tag}_${index}`, rentCents: 100000, servicesCents: 0, autoChargesEnabled: false } })));
  const lease = leases[0];
  await prisma.tenantPortalAccess.create({ data: { userId: tenantUser.id, tenantId: tenant.id } });
  const bank = await prisma.bankAccount.create({ data: { ownerId: bankOwner.id, propertyId: properties[0].id, provider: "qa", bankName: "QA", ibanMasked: "QA", externalAccountId: tag } });
  const charges = await Promise.all(["2025-06", "2025-07", "2025-08", "2025-09", "2025-10"].map((period, index) => prisma.charge.create({ data: { leaseId: lease.id, period, dueDate: new Date(`${period}-05T12:00:00Z`), amountCents: 100000, items: { create: { name: "Nájemné", category: "RENT", amountCents: 100000 } }, allocations: { create: { amountCents: 100000, transaction: { create: { bankAccountId: bank.id, externalId: `${tag}_${index}`, bookedAt: new Date(`${period}-04T12:00:00Z`), amountCents: 100000, currency: "CZK", status: "MATCHED" } } } } } })));
  const signature = new Uint8Array(await sharp(Buffer.from('<svg width="400" height="120"><rect width="400" height="120" fill="white"/><path d="M20 80 Q80 5 120 70 T220 60 L350 85" fill="none" stroke="black" stroke-width="5"/></svg>')).png().toBuffer());
  const profile = (ownerId: string) => prisma.ownerReceiptProfile.findUniqueOrThrow({ where: { ownerId } });
  const rep = (ownerId: string) => prisma.ownerRepresentative.findUniqueOrThrow({ where: { ownerId_userId: { ownerId, userId: signer.id } } });
  const consent = async (ownerId: string) => { const p = await profile(ownerId), r = await rep(ownerId); await consentOwnerReceiptSignature(signer, ownerId, r.id, { action: "consent", authorization: true, revision: r.updatedAt.toISOString(), profileRevision: p.revision, signature }); };
  try {
    await check("legacy global signature and manager role never substitute for an explicit landlord", async () => {
      await prisma.user.update({ where: { id: editor.id }, data: { receiptSignatureData: signature, receiptIssuerName: editor.name, receiptIssuerAddress: "Testovací", receiptIssuanceEnabled: true } });
      assert.equal((await receiptIssuerStatusForLease(lease.id, "2025-06")).ready, false);
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[0].id), /potvrzen pronajímatel/);
      assert.equal(await prisma.tenantPaymentReceipt.count({ where: { chargeId: { in: charges.map(c => c.id) } } }), 0);
    });
    await check("one person can represent two legal issuers without acquiring their portfolio access", async () => {
      for (const owner of [ownerA, ownerB]) {
        await saveOwnerReceiptProfile(admin, owner.id, { revision: "new", issuerName: owner.name, issuerAddress: owner.address!, enabled: false });
        await saveOwnerRepresentative(admin, owner.id, { action: "add", userEmail: signer.email, roleLabel: "Jednatel", active: true });
        const representative = await rep(owner.id);
        assert.equal((await profile(owner.id)).designatedRepresentativeId, representative.id);
        const task = await prisma.task.findUniqueOrThrow({ where: { dedupeKey: `owner-receipt-consent:${representative.id}` } });
        assert.equal(task.assigneeId, signer.id);
        assert.ok(task.description?.includes(`/vlastnici/${owner.id}/doklady#doklady-a-podpisy`));
      }
      assert.equal((await getMyOwnerReceiptSettings(signer)).length, 2);
      assert.equal((await getMyOwnerReceiptSettings(admin)).length, 0);
      assert.equal(await getLeaseReceiptDocuments(signer, lease.id), null);
      assert.equal(await getOwnerReceiptSettings(outsider, ownerA.id), null);
      const settings = await getOwnerReceiptSettings(signer, ownerA.id);
      assert.equal(settings?.canManage, false); assert.ok(settings?.representatives[0].canConsent);
      assert.ok(!JSON.stringify(settings).includes("signatureData"));
      await assert.rejects(saveOwnerReceiptProfile(editor, ownerA.id, { revision: (await profile(ownerA.id)).updatedAt.toISOString(), issuerName: "Cizí zásah", issuerAddress: "Testovací", enabled: false }), /oprávnění/);
    });
    await check("only the actual representative personally consents to the exact issuer identity", async () => {
      const r = await rep(ownerA.id), p = await profile(ownerA.id);
      await assert.rejects(consentOwnerReceiptSignature(admin, ownerA.id, r.id, { action: "consent", authorization: true, revision: r.updatedAt.toISOString(), profileRevision: p.revision, signature }), /pouze uvedená osoba/);
      await assert.rejects(consentOwnerReceiptSignature(signer, ownerA.id, r.id, { action: "consent", authorization: false, revision: r.updatedAt.toISOString(), profileRevision: p.revision, signature }), /Potvrďte/);
      await consent(ownerA.id); await consent(ownerB.id);
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { dedupeKey: `owner-receipt-consent:${r.id}` } })).status, "DONE");
      for (const owner of [ownerA, ownerB]) { const p = await profile(owner.id), r = await rep(owner.id); await saveOwnerReceiptProfile(admin, owner.id, { revision: p.updatedAt.toISOString(), issuerName: p.issuerName, issuerAddress: p.issuerAddress, enabled: true, designatedRepresentativeId: r.id }); }
      await assert.rejects(saveOwnerReceiptProfile(admin, ownerA.id, { revision: (await profile(ownerA.id)).updatedAt.toISOString(), issuerName: ownerA.name, issuerAddress: ownerA.address!, enabled: true, designatedRepresentativeId: (await rep(ownerB.id)).id }), /právě za tohoto vlastníka/);
    });
    await check("unit editor cannot reuse another unit's owner; global manager can explicitly confirm subletting", async () => {
      const choices = await receiptLandlordChoices(editor, leases[1].id);
      assert.ok(choices.some(row => row.id === ownerB.id)); assert.ok(!choices.some(row => row.id === ownerA.id));
      await assert.rejects(saveLeaseLandlordPeriod(editor, leases[1].id, { action: "add", ownerId: ownerA.id, fromPeriod: "2025-01", active: true }), /není dostupný/);
      await saveLeaseLandlordPeriod(admin, leases[1].id, { action: "add", ownerId: ownerA.id, fromPeriod: "2025-01", active: true });
      await saveLeaseLandlordPeriod(admin, lease.id, { action: "add", ownerId: ownerA.id, fromPeriod: "2025-01", toPeriod: "2025-06", active: true });
      await saveLeaseLandlordPeriod(admin, lease.id, { action: "add", ownerId: ownerB.id, fromPeriod: "2025-07", active: true });
      assert.equal((await receiptIssuerStatusForLease(lease.id, "2025-06")).ownerId, ownerA.id);
      assert.equal((await receiptIssuerStatusForLease(lease.id, "2025-07")).ownerId, ownerB.id);
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).ownerBankAccountId, bankAccount.id);
    });
    await check("individual owner uses own account signature without representative selection", async () => {
      const individual = await prisma.owner.create({ data: { name: `${tag}_PERSON`, type: "PERSON", userId: signer.id, address: "Testovací 12, Praha" } });
      owners.push(individual);
      const personalUnit = await prisma.unit.create({ data: { propertyId: properties[0].id, label: "PERSON", ownerships: { create: { ownerId: individual.id, shareBasisPoints: 10000 } } } });
      units.push(personalUnit);
      const personalLease = await prisma.lease.create({ data: { unitId: personalUnit.id, tenantId: tenant.id, startDate: new Date("2025-01-01T12:00:00Z"), endDate: new Date("2025-02-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: `${tag}_personal`, rentCents: 100000, servicesCents: 0 } });
      leases.push(personalLease);
      await saveOwnerReceiptProfile(admin, individual.id, { revision: "new", issuerName: individual.name, issuerAddress: individual.address!, enabled: true });
      await saveLeaseLandlordPeriod(admin, personalLease.id, { action: "add", ownerId: individual.id, fromPeriod: "2025-01", active: true });
      assert.equal((await receiptIssuerStatusForLease(personalLease.id, "2025-01")).ready, false);
      await prisma.user.update({ where: { id: signer.id }, data: { receiptSignatureData: signature, receiptIssuanceEnabled: true } });
      assert.equal((await receiptIssuerStatusForLease(personalLease.id, "2025-01")).ready, true);
      assert.equal((await profile(individual.id)).designatedRepresentativeId, null);
    });
    await check("overlapping landlord periods are rejected including concurrent writers", async () => {
      await assert.rejects(saveLeaseLandlordPeriod(admin, lease.id, { action: "add", ownerId: ownerA.id, fromPeriod: "2025-06", toPeriod: "2025-08", active: true }), /překrývat/);
      const concurrentLease = await prisma.lease.create({ data: { unitId: units[0].id, tenantId: tenant.id, startDate: new Date("2000-01-01T12:00:00Z"), endDate: new Date("2001-01-01T12:00:00Z"), financialTrackingFromPeriod: "2000-01", variableSymbol: `${tag}_concurrent`, rentCents: 10000, servicesCents: 0 } });
      leases.push(concurrentLease);
      const results = await Promise.allSettled([saveLeaseLandlordPeriod(admin, concurrentLease.id, { action: "add", ownerId: ownerA.id, fromPeriod: "2000-01", toPeriod: "2000-06", active: true }), saveLeaseLandlordPeriod(admin, concurrentLease.id, { action: "add", ownerId: ownerB.id, fromPeriod: "2000-04", toPeriod: "2000-09", active: true })]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(await prisma.leaseLandlordPeriod.count({ where: { leaseId: concurrentLease.id, active: true } }), 1);
    });
    await check("staff and tenant share one immutable receipt while landlord differs from bank recipient", async () => {
      const current = await profile(ownerA.id);
      await saveOwnerReceiptProfile(admin, ownerA.id, { revision: current.updatedAt.toISOString(), issuerName: current.issuerName, issuerAddress: current.issuerAddress, enabled: true, stamp: signature });
      const issued = await issueStaffReceipt(editor, lease.id, charges[0].id), repeated = await issueTenantReceipt(tenantUser, tenant.id, charges[0].id);
      assert.equal(repeated.id, issued.id); assert.equal(issued.issuerId, signer.id); assert.equal(issued.issuerOwnerId, ownerA.id);
      assert.equal(Buffer.from(issued.pdfData).subarray(0, 4).toString(), "%PDF");
      assert.deepEqual(Buffer.from(repeated.pdfData), Buffer.from(issued.pdfData));
      assert.equal((issued.snapshot as Record<string, unknown>).signerName, signer.name);
      assert.equal((issued.snapshot as Record<string, unknown>).stampHash, (await profile(ownerA.id)).stampHash);
      assert.equal((issued.snapshot as Record<string, unknown>).requestedById, editor.id);
      assert.notEqual(issued.issuerOwnerId, bankOwner.id);
      const july = await issueStaffReceipt(editor, lease.id, charges[1].id); assert.equal(july.issuerOwnerId, ownerB.id);
      await assert.rejects(issueStaffReceipt(viewer, lease.id, charges[2].id));
      await assert.rejects(issueStaffReceipt(outsider, lease.id, charges[2].id));
      assert.equal(await staffReceiptArchive(outsider, lease.id, issued.id), null);
      assert.equal((await staffReceiptArchive(viewer, lease.id, issued.id))?.id, issued.id);
      assert.equal(await staffReceiptArchive(editor, leases[1].id, issued.id), null);
    });
    await check("identity revision invalidates consent and old archives survive inactive source charge", async () => {
      const stored = await prisma.tenantPaymentReceipt.findFirstOrThrow({ where: { chargeId: charges[1].id } });
      const p = await profile(ownerB.id);
      await saveOwnerReceiptProfile(admin, ownerB.id, { revision: p.updatedAt.toISOString(), issuerName: `${ownerB.name} nová adresa`, issuerAddress: "Nová 45, Praha", enabled: true, designatedRepresentativeId: (await rep(ownerB.id)).id });
      const blocked = await receiptIssuerStatusForLease(lease.id, "2025-07"); assert.equal(blocked.ready, false); assert.equal(blocked.ownerId, ownerB.id); assert.ok(blocked.issuerName);
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[2].id), /souhlas/);
      await prisma.charge.update({ where: { id: charges[1].id }, data: { active: false } });
      const archived = await staffReceiptArchive(editor, lease.id, stored.id); assert.deepEqual(Buffer.from(archived!.pdfData), Buffer.from(stored.pdfData));
      const listing = await getLeaseReceiptDocuments(editor, lease.id); assert.equal(listing?.receipts.find(r => r.id === stored.id)?.chargeActive, false);
      await consent(ownerB.id);
    });
    await check("revoked authority blocks new issuance and restored activity does not restore consent", async () => {
      const r = await rep(ownerB.id);
      await saveOwnerRepresentative(admin, ownerB.id, { action: "update", representativeId: r.id, revision: r.updatedAt.toISOString(), roleLabel: r.roleLabel || "", active: false });
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[2].id), /podepisující/);
      const off = await rep(ownerB.id);
      await saveOwnerRepresentative(admin, ownerB.id, { action: "update", representativeId: off.id, revision: off.updatedAt.toISOString(), roleLabel: off.roleLabel || "", active: true });
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[2].id), /souhlas/);
      await consent(ownerB.id);
      await prisma.userUnit.delete({ where: { userId_unitId: { userId: editor.id, unitId: units[0].id } } });
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[2].id));
      await prisma.userUnit.create({ data: { userId: editor.id, unitId: units[0].id, permission: "EDIT" } });
    });
    await check("staff may document ended leases while tenant/cancelled/future issuance stays blocked", async () => {
      await prisma.lease.update({ where: { id: lease.id }, data: { endDate: new Date("2025-12-31T12:00:00Z") } });
      await prisma.tenant.update({ where: { id: tenant.id }, data: { active: false } });
      const issued = await issueStaffReceipt(editor, lease.id, charges[2].id); assert.equal(issued.issuerOwnerId, ownerB.id);
      assert.equal((await getLeaseReceiptDocuments(editor, lease.id))?.charges.find(c => c.id === charges[3].id)?.eligible, true);
      await assert.rejects(issueTenantReceipt(tenantUser, tenant.id, charges[3].id));
      await prisma.lease.update({ where: { id: lease.id }, data: { cancelledAt: new Date() } });
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[3].id));
      await prisma.lease.update({ where: { id: lease.id }, data: { cancelledAt: null, endDate: null, startDate: new Date("2099-01-01T12:00:00Z") } });
      await assert.rejects(issueStaffReceipt(editor, lease.id, charges[3].id));
    });
    console.log(`Owner receipt representation: ${checks} checks passed.`);
  } finally {
    const leaseIds = leases.map(row => row.id), ownerIds = owners.map(row => row.id), userIds = users.map(row => row.id);
    await prisma.tenantPaymentReceipt.deleteMany({ where: { charge: { leaseId: { in: leaseIds } } } });
    await prisma.leaseLandlordPeriod.deleteMany({ where: { leaseId: { in: leaseIds } } });
    await prisma.ownerReceiptProfile.deleteMany({ where: { ownerId: { in: ownerIds } } });
    await prisma.ownerRepresentative.deleteMany({ where: { ownerId: { in: ownerIds } } });
    await prisma.task.deleteMany({ where: { assigneeId: signer.id, dedupeKey: { startsWith: "owner-receipt-consent:" } } });
    await prisma.charge.deleteMany({ where: { leaseId: { in: leaseIds } } });
    await prisma.bankTransaction.deleteMany({ where: { bankAccountId: bank.id } });
    await prisma.bankAccount.delete({ where: { id: bank.id } });
    await prisma.lease.deleteMany({ where: { id: { in: leaseIds } } });
    await prisma.tenantPortalAccess.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.unit.deleteMany({ where: { id: { in: units.map(row => row.id) } } });
    await prisma.property.deleteMany({ where: { id: { in: properties.map(row => row.id) } } });
    await prisma.ownerBankAccount.deleteMany({ where: { ownerId: { in: ownerIds } } });
    await prisma.owner.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
