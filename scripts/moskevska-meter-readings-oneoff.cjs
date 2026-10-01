// One-off REpilot meter history import for P1002. Default mode is read-only.
// The source manifest and backup live outside the repository.
const fs = require('node:fs');
const crypto = require('node:crypto');
let db;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const instant = date => new Date(`${date}T12:00:00.000Z`);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function source() {
  const path = process.env.REPILOT_METER_MANIFEST;
  assert(path, 'REPILOT_METER_MANIFEST is required');
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert(data.propertyCode === 'P1002' && Array.isArray(data.readings) && data.readings.length === 16, 'Expected 16 verified P1002 readings');
  const unique = new Set();
  for (const row of data.readings) {
    assert(Object.keys(row).sort().join() === ['date','note','serial','source','target','type','value'].sort().join(), 'Unexpected source columns');
    assert(row.source === 'REpilot' && typeof row.note === 'string' && row.note.trim(), 'Each reading needs source and note');
    assert(row.target === 'HOUSE' || ['P1002-U005', 'P1002-U008'].includes(row.target), 'Unexpected target unit');
    assert(typeof row.serial === 'string' && row.serial.length > 3 && typeof row.type === 'string', 'Missing meter identity');
    assert(/^20\d\d-\d\d-\d\d$/.test(row.date) && !Number.isNaN(instant(row.date).valueOf()), 'Invalid date');
    assert(typeof row.value === 'number' && Number.isFinite(row.value) && row.value >= 0, 'Invalid value');
    const key = [row.target, row.serial, row.type, row.date].join('|');
    assert(!unique.has(key), `Duplicate source reading ${key}`);
    unique.add(key);
  }
  return data.readings;
}

async function preflight(rows) {
  const property = await db.property.findUnique({ where: { propertyCode: 'P1002' }, include: { units: { select: { id: true, unitCode: true } } } });
  assert(property?.name === 'Moskevská' && property.units.length === 15, 'P1002 / 15-unit scope changed');
  const meters = await db.meter.findMany({ where: { propertyId: property.id }, include: { readings: true } });
  const planned = [];
  for (const row of rows) {
    const unit = row.target === 'HOUSE' ? null : property.units.find(x => x.unitCode === row.target);
    assert(row.target === 'HOUSE' || unit, `Target unit missing: ${row.target}`);
    const candidates = meters.filter(m => m.unitId === (unit?.id || null) && m.serialNumber === row.serial && m.type === row.type);
    assert(candidates.length === 1, `Expected exactly one meter for ${row.target}/${row.serial}/${row.type}; got ${candidates.length}`);
    const meter = candidates[0];
    const sameDay = meter.readings.filter(r => r.readAt.toISOString().slice(0, 10) === row.date);
    assert(sameDay.length < 2, `Multiple target readings on ${row.date}`);
    if (sameDay.length) assert(sameDay[0].value === row.value, `Target value differs for ${row.target}/${row.serial}/${row.date}`);
    planned.push({ row, meterId: meter.id, existingId: sameDay[0]?.id || null });
  }
  return { property, meters, planned };
}

function backup(state, path, apply) {
  assert(path, 'BACKUP_PATH is required');
  const content = JSON.stringify({ propertyCode: 'P1002', meterIds: state.meters.map(m => m.id), meters: state.meters }, null, 2);
  if (!apply) fs.writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
  else assert(fs.existsSync(path) && fs.readFileSync(path, 'utf8') === content, 'Backup absent or production meters changed since preflight');
  return sha(content);
}

async function run() {
  const rows = source();
  if (process.env.VALIDATE_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ mode: 'SOURCE_VALIDATED', count: rows.length,
      targets: rows.reduce((counts, row) => ({ ...counts, [row.target]: (counts[row.target] || 0) + 1 }), {}),
    }, null, 2));
    return;
  }
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient();
  const state = await preflight(rows);
  const plan = state.planned.map(({ row, meterId, existingId }) => ({ target: row.target, serial: row.serial, type: row.type, date: row.date, value: row.value, meterId, existingId }));
  console.log(JSON.stringify({ mode: process.env.APPLY === '1' ? 'APPLY' : 'DRY_RUN', plan }, null, 2));
  if (process.env.APPLY !== '1') {
    if (process.env.BACKUP_PATH) console.log(`Backup SHA-256 ${backup(state, process.env.BACKUP_PATH, false)}`);
    return;
  }
  const digest = backup(state, process.env.BACKUP_PATH, true);
  assert(process.env.DURABLE_BACKUP_CONFIRMED === digest, 'Confirm durable backup SHA-256 before APPLY');
  const created = await db.$transaction(async tx => {
    const result = [];
    for (const { row, meterId, existingId } of state.planned) {
      if (existingId) continue;
      const reading = await tx.meterReading.create({ data: {
        meterId, readAt: instant(row.date), value: row.value, method: 'LEGACY',
        note: `Převzato z REpilot: ${row.note}; původní způsob odečtu nezjištěn.`,
      } });
      result.push({ id: reading.id, meterId, date: row.date, value: row.value });
    }
    return result;
  });
  console.log(JSON.stringify({ mode: 'APPLIED', created }, null, 2));
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db?.$disconnect());
