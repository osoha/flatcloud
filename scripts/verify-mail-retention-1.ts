import assert from "node:assert/strict";
import fs from "node:fs";
import { prisma } from "../lib/db";
import { BANK_EMAIL_RAW_RETENTION_DAYS, BANK_EMAIL_RETENTION_BATCH_SIZE, bankEmailRawRetentionCutoff, cleanupInboundMailbox } from "../lib/inbound-bank/retention";

const read = (path: string) => fs.readFileSync(path, "utf8");
let n = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) { await fn(); console.log(`✓ ${++n}. ${name}`); }

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const marker = `mail-retention-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const runNow = new Date("1901-04-11T00:00:00.000Z");
  const cutoff = bankEmailRawRetentionCutoff(runNow);
  const oldAt = new Date(cutoff.getTime() - 1);
  const newAt = new Date(cutoff.getTime() + 1);
  const boundaryAt = new Date(cutoff);
  const settingsBefore = await prisma.appSetting.findUnique({ where: { id: "global" } });
  const owner = await prisma.owner.create({ data: { name: marker } });
  try {
    const property = await prisma.property.create({ data: { name: marker, address: "Test 1", city: "Praha", ownerId: owner.id } });
    const unit = await prisma.unit.create({ data: { propertyId: property.id, label: marker } });
    const tenant = await prisma.tenant.create({ data: { name: marker } });
    const lease = await prisma.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("1900-01-01T00:00:00Z"), financialTrackingFromPeriod: "1900-01", variableSymbol: "100100", rentCents: 10000, servicesCents: 0 } });
    const charge = await prisma.charge.create({ data: { leaseId: lease.id, period: "1900-01", dueDate: new Date("1900-01-05T00:00:00Z"), amountCents: 10000 } });
    const account = await prisma.bankAccount.create({ data: { propertyId: property.id, provider: marker, bankName: "Test", ibanMasked: "CZ••0001", externalAccountId: marker } });
    const matched = await prisma.bankTransaction.create({ data: { bankAccountId: account.id, externalId: `${marker}-matched`, bookedAt: oldAt, amountCents: 10000, variableSymbol: "100100", counterpartyName: "Retained payer", counterpartyIban: "CZ0001", message: "Retained message", status: "MATCHED", suggestedLeaseId: lease.id, source: "email", allocations: { create: { chargeId: charge.id, amountCents: 10000 } } } });
    const unmatched = await prisma.bankTransaction.create({ data: { bankAccountId: account.id, externalId: `${marker}-unmatched`, bookedAt: oldAt, amountCents: 12000, variableSymbol: "100101", counterpartyName: "Unmatched payer", status: "UNMATCHED", suggestedLeaseId: lease.id, source: "email" } });
    const rows = await Promise.all([
      prisma.inboxPayment.create({ data: { messageId: `${marker}-old`, receivedAt: oldAt, rawExcerpt: "SECRET OLD RAW", amountCents: 10000, variableSymbol: "100100", counterpartyName: "Retained payer", status: "IMPORTED", transactionId: matched.id, propertyId: property.id } }),
      prisma.inboxPayment.create({ data: { messageId: `${marker}-unmatched`, receivedAt: oldAt, rawExcerpt: "SECRET UNMATCHED RAW", amountCents: 12000, variableSymbol: "100101", counterpartyName: "Unmatched payer", status: "UNMATCHED", transactionId: unmatched.id, propertyId: property.id } }),
      prisma.inboxPayment.create({ data: { messageId: `${marker}-boundary`, receivedAt: boundaryAt, rawExcerpt: "SECRET BOUNDARY RAW", status: "ERROR" } }),
      prisma.inboxPayment.create({ data: { messageId: `${marker}-new`, receivedAt: newAt, rawExcerpt: "SECRET NEW RAW", status: "RECEIVED" } }),
    ]);
    await check("canonical retention is 100 days", () => assert.equal(BANK_EMAIL_RAW_RETENTION_DAYS, 100));
    await check("cutoff is absolute 100x24 hours", () => assert.equal(runNow.getTime() - cutoff.getTime(), 100 * 86_400_000));
    const first = await cleanupInboundMailbox({ now: runNow });
    const after = await prisma.inboxPayment.findMany({ where: { id: { in: rows.map(r => r.id) } }, orderBy: { messageId: "asc" } });
    await check("newer message remains raw", () => assert.equal(after.find(r => r.id === rows[3].id)?.rawExcerpt, "SECRET NEW RAW"));
    await check("older message raw is purged", () => assert.equal(after.find(r => r.id === rows[0].id)?.rawExcerpt, null));
    await check("inclusive boundary is purged", () => assert.equal(after.find(r => r.id === rows[2].id)?.rawExcerpt, null));
    const matchedAfter = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: matched.id }, include: { allocations: { include: { charge: { include: { lease: true } } } }, inboxPayment: true } });
    const unmatchedAfter = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: unmatched.id }, include: { inboxPayment: true, suggestedLease: true } });
    await check("normalized transaction remains", () => assert.deepEqual([matchedAfter.amountCents, matchedAfter.variableSymbol, matchedAfter.counterpartyName], [10000, "100100", "Retained payer"]));
    await check("matched allocation remains", () => assert.equal(matchedAfter.allocations[0].amountCents, 10000));
    await check("unmatched transaction remains resolvable", () => assert.deepEqual([unmatchedAfter.status, unmatchedAfter.amountCents, unmatchedAfter.inboxPayment?.variableSymbol], ["UNMATCHED", 12000, "100101"]));
    await check("lease relation remains", () => assert.equal(matchedAfter.allocations[0].charge.lease.id, lease.id));
    await check("charge/payment history remains", () => assert.equal(matchedAfter.allocations[0].charge.id, charge.id));
    const second = await cleanupInboundMailbox({ now: runNow });
    await check("second cleanup is idempotent", () => assert.equal(second.purged, 0));
    await check("mixed rows behave correctly", () => assert.deepEqual([first.purged, second.purged], [3, 0]));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "BANK_EMAIL_RETENTION_RUN", createdAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: "desc" } });
    await check("aggregate audit is written", () => assert.equal(audit.entityId, "global"));
    await check("audit contains no raw body", () => assert.ok(!JSON.stringify(audit.details).includes("SECRET")));
    await check("batch size is bounded", () => assert.ok(BANK_EMAIL_RETENTION_BATCH_SIZE > 0 && BANK_EMAIL_RETENTION_BATCH_SIZE <= 500));
    const detail = read("app/platby/nesparovane/email/[id]/page.tsx");
    const txDetail = read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx");
    await check("raw detail has purge notice and no subject fallback", () => { assert.match(detail, /po 100 dnech odstraněna/); assert.doesNotMatch(detail, /rawExcerpt \|\| row\.subject/); });
    await check("UI retains normalized data and purge notice", () => { assert.match(detail, /row\.amountCents/); assert.match(detail, /row\.variableSymbol/); assert.match(txDetail, /po 100 dnech odstraněna/); });
    const scheduler = read("scripts/scheduler-cron.ts");
    const manual = read("app/api/settings/inbound-mail/cleanup/route.ts");
    await check("scheduler uses shared service", () => assert.match(scheduler, /cleanupInboundMailbox\(\)/));
    await check("scheduler failure is non-critical", () => { const block = scheduler.slice(scheduler.indexOf('name: "mailbox-retention"'), scheduler.indexOf("const charges")); assert.doesNotMatch(block, /hardFailure = true/); });
    await check("manual cleanup uses shared service", () => assert.match(manual, /cleanupInboundMailbox\(\{ actorId: user\.id \}\)/));
    await check("manual cleanup requires SUPER_ADMIN", () => assert.match(manual, /user\.role !== "SUPER_ADMIN"/));
    await check("no inbound attachment storage relation exists", () => assert.doesNotMatch(read("prisma/schema.prisma").match(/model InboxPayment \{[\s\S]*?\n\}/)?.[0] || "", /FileAsset|Document/));
    await check("parser for new mail is unchanged", () => assert.match(read("lib/inbound-bank/sync.ts"), /rawExcerpt: parsedPayment\.rawExcerpt/));
    await check("matching implementation is untouched by retention", () => assert.doesNotMatch(read("lib/inbound-bank/retention.ts"), /processTransaction|PaymentAllocation|Charge|Lease/));
    await check("MF files are outside retention implementation", () => assert.doesNotMatch(read("lib/inbound-bank/retention.ts"), /mf-rent|MfRent/));
    await check("reporting files are outside retention implementation", () => assert.doesNotMatch(read("lib/inbound-bank/retention.ts"), /reporting|Quarterly/));
  } finally {
    await prisma.auditLog.deleteMany({ where: { action: "BANK_EMAIL_RETENTION_RUN", createdAt: { gte: new Date(Date.now() - 120_000) } } });
    await prisma.inboxPayment.deleteMany({ where: { messageId: { startsWith: marker } } });
    await prisma.property.deleteMany({ where: { ownerId: owner.id } });
    await prisma.tenant.deleteMany({ where: { name: marker } });
    await prisma.owner.delete({ where: { id: owner.id } });
    if (settingsBefore) await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastCleanupAt: settingsBefore.inboundMailLastCleanupAt, inboundMailLastCleanupSuccessAt: settingsBefore.inboundMailLastCleanupSuccessAt, inboundMailLastCleanupPurged: settingsBefore.inboundMailLastCleanupPurged, inboundMailLastCleanupSummary: settingsBefore.inboundMailLastCleanupSummary } });
    await prisma.$disconnect();
  }
  console.log(`MAIL-RETENTION-1 verified (${n} checks).`);
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
