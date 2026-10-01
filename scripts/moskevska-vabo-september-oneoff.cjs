// One-off historical REpilot transfer. The private source manifest is never committed.
// Default: read-only preflight. APPLY=1 additionally requires a fresh backup path.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();
const propertyCode = '1002';
const leases = {
  U005: { id: 'cmumshuud0026kb2ak4b3pypb', unitCode: 'P1002-U005', owner: 'František Pokorný', expectedExistingSeptember: false },
  U008: { id: 'cmums4a5t0016kb2agawqz6q9', unitCode: 'P1002-U008', owner: 'Jiří Bělohlávek', expectedExistingSeptember: true },
};
const at = value => new Date(`${value}T12:00:00.000Z`);
const assert = (condition, message) => { if (!condition) throw Error(message); };
const exactKeys = (object, keys, context) => assert(JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort()), `${context}: unexpected or missing fields`);
const account = value => assert(/^\d{1,16}\/\d{4}$/.test(value), 'Invalid domestic account');
const cents = value => assert(Number.isSafeInteger(value) && value > 0, 'Invalid positive amount');

function loadSource() {
  const path = process.env.REPILOT_SOURCE_MANIFEST;
  assert(path, 'REPILOT_SOURCE_MANIFEST is required');
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  exactKeys(data, ['propertyCode', 'rows'], 'manifest');
  assert(data.propertyCode === 'P1002', 'Wrong source manifest property code');
  exactKeys(data.rows, Object.keys(leases), 'manifest rows');
  for (const [key, row] of Object.entries(data.rows)) {
    exactKeys(row, ['sourceLeaseId', 'sourceBillId', 'sourceRecordId', 'period', 'dueDate', 'receivedAt', 'rentCents', 'servicesCents', 'amountCents', 'recipientAccount', 'payerAccount', 'payerName', 'variableSymbol', 'bankName'], key);
    assert(row.period === '2026-09' && row.dueDate === '2026-09-20' && row.receivedAt === '2026-09-22', `${key}: unexpected period or date`);
    for (const field of ['rentCents', 'servicesCents', 'amountCents']) cents(row[field]);
    assert(row.rentCents + row.servicesCents === row.amountCents, `${key}: amount mismatch`);
    assert(row.rentCents === 955000 && row.amountCents === (key === 'U005' ? 1020000 : 1070000), `${key}: source invoice differs from reviewed evidence`);
    assert(row.servicesCents === (key === 'U005' ? 65000 : 115000), `${key}: source services differ`);
    account(row.recipientAccount); account(row.payerAccount);
    assert(row.payerName === 'Vazníky VABO s.r.o.', `${key}: payer mismatch`);
    assert(row.variableSymbol === (key === 'U005' ? '157524501' : '1575240701'), `${key}: VS mismatch`);
    assert(row.bankName === (key === 'U005' ? 'ČSOB' : 'Air Bank'), `${key}: bank mismatch`);
    assert(row.sourceLeaseId === (key === 'U005' ? '3unhc3PaY-pyMteyumjD' : '7va3v5WuNhGq4Pb1N5cK'), `${key}: REpilot lease mismatch`);
    assert(row.sourceBillId && row.sourceRecordId && !/[\s/]/.test(row.sourceBillId + row.sourceRecordId), `${key}: invalid source IDs`);
  }
  return data.rows;
}

async function preflight(rows) {
  const property = await db.property.findUnique({ where: { propertyCode }, include: { units: { select: { id: true } } } });
  assert(property?.name === 'Moskevská' && property.units.length === 15, 'P1002 or 15-unit scope changed');
  const inspected = {};
  for (const [key, cfg] of Object.entries(leases)) {
    const row = rows[key];
    const lease = await db.lease.findUnique({ where: { id: cfg.id }, include: {
      tenant: true, unit: { include: { property: true, ownerships: { include: { owner: true, ownerBankAccount: true } } } },
      charges: { where: { period: { in: ['2026-09', '2026-10'] } }, include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true } },
    } });
    assert(lease?.unit?.propertyId === property.id && lease.unit.unitCode === cfg.unitCode, `${key}: wrong target lease/unit`);
    assert(lease.tenant.name.toLowerCase().includes('vabo'), `${key}: wrong tenant`);
    assert(lease.unit.ownerships.some(x => x.owner.name === cfg.owner && x.ownerBankAccount?.accountNumber && `${x.ownerBankAccount.accountNumber}/${x.ownerBankAccount.bankCode}` === row.recipientAccount), `${key}: recipient is not the verified unit owner account`);
    const september = lease.charges.find(x => x.period === '2026-09');
    const october = lease.charges.find(x => x.period === '2026-10');
    assert(october?.amountCents === row.amountCents, `${key}: October template differs; inspect source history`);
    assert(Boolean(september) === cfg.expectedExistingSeptember, `${key}: September charge state changed`);
    if (september) {
      assert(september.active && september.amountCents === row.amountCents && september.allocations.length === 0 && september.securityDepositOffsets.length === 0 && september.creditApplications.length === 0, `${key}: September charge already changed/paid`);
      assert(september.items.find(x => x.category === 'RENT')?.amountCents === row.rentCents && september.items.find(x => x.category === 'SERVICES')?.amountCents === row.servicesCents, `${key}: September items differ from source`);
    }
    const externalId = `repilot:${row.sourceRecordId}`;
    const duplicate = await db.bankTransaction.findFirst({ where: { bankAccount: { propertyId: property.id }, OR: [
      { externalId },
      { bookedAt: at(row.receivedAt), amountCents: row.amountCents, variableSymbol: row.variableSymbol, counterpartyName: { contains: 'VABO', mode: 'insensitive' } },
    ] }, include: { bankAccount: true, allocations: true } });
    assert(!duplicate, `${key}: possible duplicate transaction ${duplicate?.id}`);
    const historicAccount = await db.bankAccount.findUnique({ where: { provider_externalAccountId: { provider: 'repilot_history', externalAccountId: row.recipientAccount } } });
    assert(!historicAccount || historicAccount.propertyId === property.id && historicAccount.ibanMasked === row.recipientAccount, `${key}: bank account collision`);
    inspected[key] = { lease, september, october, historicAccount };
  }
  return { property, inspected };
}

function backupPayload(rows, state) {
  return { propertyCode, rows, target: Object.fromEntries(Object.entries(state.inspected).map(([key, x]) => [key, {
    lease: x.lease, september: x.september, october: x.october, historicAccount: x.historicAccount,
  }])) };
}
function backup(rows, state, path, apply) {
  assert(path, 'BACKUP_PATH is required for a backup');
  const expected = JSON.stringify(backupPayload(rows, state), null, 2);
  if (!apply) {
    assert(!fs.existsSync(path), 'Use a new BACKUP_PATH outside the repository');
    fs.writeFileSync(path, expected, { flag: 'wx', mode: 0o600 });
  } else {
    assert(fs.existsSync(path), 'Prepare and durably copy the backup in dry-run mode first');
    assert(fs.readFileSync(path, 'utf8') === expected, 'Target changed since backup; prepare a fresh backup');
  }
  return crypto.createHash('sha256').update(expected).digest('hex');
}

async function run() {
  const rows = loadSource();
  if (process.env.VALIDATE_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ mode: 'SOURCE_VALIDATED', rows: Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, {
      sourceLeaseId: row.sourceLeaseId, sourceBillId: row.sourceBillId, sourceRecordId: row.sourceRecordId,
      period: row.period, receivedAt: row.receivedAt, amountCents: row.amountCents,
    }])) }, null, 2));
    return;
  }
  const state = await preflight(rows);
  const plan = Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, {
    unit: leases[key].unitCode, sourceBillId: row.sourceBillId, sourceRecordId: row.sourceRecordId,
    invoiceCents: row.amountCents, receivedAt: row.receivedAt, recipientAccount: row.recipientAccount,
    existingSeptemberChargeId: state.inspected[key].september?.id || null,
  }]));
  console.log(JSON.stringify({ mode: process.env.APPLY === '1' ? 'APPLY' : 'DRY_RUN', plan }, null, 2));
  if (process.env.APPLY !== '1') {
    if (process.env.BACKUP_PATH) console.log(`Backup SHA-256 ${backup(rows, state, process.env.BACKUP_PATH, false)}`);
    return;
  }
  const digest = backup(rows, state, process.env.BACKUP_PATH, true);
  assert(process.env.DURABLE_BACKUP_CONFIRMED === digest, 'Set DURABLE_BACKUP_CONFIRMED to the verified SHA-256 of a durable backup');
  const created = await db.$transaction(async tx => {
    const ids = {};
    for (const [key, cfg] of Object.entries(leases)) {
      const row = rows[key];
      let charge = state.inspected[key].september;
      if (!charge) charge = await tx.charge.create({ data: {
        leaseId: cfg.id, period: '2026-09', dueDate: at(row.dueDate), amountCents: row.amountCents,
        active: true, manualOverride: true, debtTreatment: 'HISTORICAL',
        note: `REpilot předpis ${row.sourceBillId}; září 2026`,
        items: { create: [ { name: 'Nájemné', category: 'RENT', amountCents: row.rentCents }, { name: 'Služby', category: 'SERVICES', amountCents: row.servicesCents } ] },
      } });
      const bankAccount = await tx.bankAccount.upsert({ where: { provider_externalAccountId: { provider: 'repilot_history', externalAccountId: row.recipientAccount } },
        update: {}, create: { propertyId: state.property.id, provider: 'repilot_history', externalAccountId: row.recipientAccount, bankName: `${row.bankName} · historický převod REpilot`, ibanMasked: row.recipientAccount } });
      const transaction = await tx.bankTransaction.create({ data: {
        bankAccountId: bankAccount.id, externalId: `repilot:${row.sourceRecordId}`, bookedAt: at(row.receivedAt), amountCents: row.amountCents,
        counterpartyName: row.payerName, counterpartyIban: row.payerAccount, variableSymbol: row.variableSymbol,
        recipientAccount: row.recipientAccount, source: 'repilot_history', status: 'MATCHED', suggestedLeaseId: cfg.id,
        message: `Historie REpilot: platba dle záznamu ${row.sourceRecordId}`,
        matchNote: `Zdroj REpilot smlouva ${row.sourceLeaseId}, předpis ${row.sourceBillId}; nezakládá nový bankovní převod.`,
        allocations: { create: { chargeId: charge.id, amountCents: row.amountCents } },
      } });
      await tx.auditLog.create({ data: { propertyId: state.property.id, action: 'REPILOT_HISTORICAL_PAYMENT_IMPORTED', entityType: 'BankTransaction', entityId: transaction.id,
        details: { leaseId: cfg.id, chargeId: charge.id, sourceLeaseId: row.sourceLeaseId, sourceBillId: row.sourceBillId, sourceRecordId: row.sourceRecordId, recipientAccount: row.recipientAccount } } });
      ids[key] = { chargeId: charge.id, bankAccountId: bankAccount.id, transactionId: transaction.id };
    }
    return ids;
  }, { timeout: 30000 });
  for (const [key, ids] of Object.entries(created)) {
    const charge = await db.charge.findUnique({ where: { id: ids.chargeId }, include: { allocations: true } });
    assert(charge?.allocations.reduce((sum, x) => sum + x.amountCents, 0) === rows[key].amountCents, `${key}: post-import allocation mismatch`);
  }
  console.log(JSON.stringify({ mode: 'APPLIED', created }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
