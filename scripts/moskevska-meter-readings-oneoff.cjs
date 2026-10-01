// One-off REpilot meter history import for P1002. Default mode is read-only.
// The source manifest and backup live outside the repository.
const fs = require('node:fs');
const crypto = require('node:crypto');
let db;
const missingHistoricalMeters = {
  'P1002-U014|2020100611|COLD_WATER': { label: 'Historický vodoměr NIPAMA do 18. 11. 2024', unitOfMeasure: 'm³' },
  'P1002-U014|9011121024227391|ELECTRICITY_HIGH_TARIFF': { label: 'Historický elektroměr NIPAMA VT před výměnou', unitOfMeasure: 'kWh' },
  'P1002-U014|0017062857-284-22-22-*|GAS': { label: 'Historický demontovaný plynoměr NIPAMA', unitOfMeasure: 'm³' },
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const instant = date => new Date(`${date}T12:00:00.000Z`);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function source() {
  const path = process.env.REPILOT_METER_MANIFEST;
  assert(path, 'REPILOT_METER_MANIFEST is required');
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert(data.propertyCode === 'P1002' && Array.isArray(data.readings) && data.readings.length === 38, 'Expected 38 verified P1002 readings');
  assert(Array.isArray(data.identifiers) && data.identifiers.length === 12, 'Expected 12 EAN/EIC meter fields');
  const unique = new Set();
  for (const row of data.readings) {
    assert(Object.keys(row).sort().join() === ['date','note','serial','source','target','type','value'].sort().join(), 'Unexpected source columns');
    assert(row.source === 'REpilot' && typeof row.note === 'string' && row.note.trim(), 'Each reading needs source and note');
    assert(row.target === 'HOUSE' || ['P1002-U005', 'P1002-U008', 'P1002-U014', 'P1002-U015'].includes(row.target), 'Unexpected target unit');
    assert(typeof row.serial === 'string' && row.serial.length > 3 && typeof row.type === 'string', 'Missing meter identity');
    assert(/^20\d\d-\d\d-\d\d$/.test(row.date) && !Number.isNaN(instant(row.date).valueOf()), 'Invalid date');
    assert(typeof row.value === 'number' && Number.isFinite(row.value) && row.value >= 0, 'Invalid value');
    const key = [row.target, row.serial, row.type, row.date].join('|');
    assert(!unique.has(key), `Duplicate source reading ${key}`);
    unique.add(key);
  }
  for (const item of data.identifiers) {
    assert(Object.keys(item).sort().join() === ['kind','serial','target','type','value'].sort().join(), 'Unexpected identifier columns');
    assert((item.kind === 'EAN' && item.type.startsWith('ELECTRICITY') && /^\d{18}$/.test(item.value)) ||
      (item.kind === 'EIC' && item.type === 'GAS' && /^[A-Z0-9]{16}$/.test(item.value)), `Invalid EAN/EIC for ${item.target}/${item.serial}`);
    assert(!unique.has(`ID|${item.target}|${item.serial}|${item.type}`), 'Duplicate identifier target');
    unique.add(`ID|${item.target}|${item.serial}|${item.type}`);
  }
  return data;
}

async function preflight(data) {
  const rows = data.readings;
  const property = await db.property.findUnique({ where: { propertyCode: 'P1002' }, include: { units: { select: { id: true, unitCode: true } } } });
  assert(property?.name === 'Moskevská' && property.units.length === 15, 'P1002 / 15-unit scope changed');
  const meters = await db.meter.findMany({ where: { propertyId: property.id }, include: { readings: true } });
  assert(meters.length && Object.hasOwn(meters[0], 'supplyPointId'), 'Deploy PR #208 schema and Prisma client before importing EAN/EIC');
  const planned = [];
  for (const row of rows) {
    const unit = row.target === 'HOUSE' ? null : property.units.find(x => x.unitCode === row.target);
    assert(row.target === 'HOUSE' || unit, `Target unit missing: ${row.target}`);
    const candidates = meters.filter(m => m.unitId === (unit?.id || null) && m.serialNumber === row.serial && m.type === row.type);
    const key = [row.target, row.serial, row.type].join('|');
    assert(candidates.length === 1 || (candidates.length === 0 && missingHistoricalMeters[key]), `Expected one meter or explicit historical meter for ${key}; got ${candidates.length}`);
    const meter = candidates[0] || null;
    const sameDay = (meter?.readings || []).filter(r => r.readAt.toISOString().slice(0, 10) === row.date);
    assert(sameDay.length < 2, `Multiple target readings on ${row.date}`);
    if (sameDay.length) assert(sameDay[0].value === row.value, `Target value differs for ${row.target}/${row.serial}/${row.date}`);
    planned.push({ row, meterId: meter?.id || null, unitId: unit?.id || null, missingMeter: meter ? null : missingHistoricalMeters[key], existingId: sameDay[0]?.id || null });
  }
  const identifiers = data.identifiers.map(item => {
    const unit = item.target === 'HOUSE' ? null : property.units.find(x => x.unitCode === item.target);
    assert(item.target === 'HOUSE' || unit, `Identifier target unit missing: ${item.target}`);
    const candidates = meters.filter(m => m.unitId === (unit?.id || null) && m.serialNumber === item.serial && m.type === item.type);
    const key = [item.target, item.serial, item.type].join('|');
    assert(candidates.length === 1 || (candidates.length === 0 && missingHistoricalMeters[key]), `Identifier meter mismatch: ${key}`);
    assert(!candidates[0]?.supplyPointId || candidates[0].supplyPointId === item.value, `Conflicting existing EAN/EIC: ${key}`);
    return { item, meterId: candidates[0]?.id || null };
  });
  return { property, meters, planned, identifiers };
}

function backup(state, path, apply) {
  assert(path, 'BACKUP_PATH is required');
  const content = JSON.stringify({ propertyCode: 'P1002', meterIds: state.meters.map(m => m.id), meters: state.meters }, null, 2);
  if (!apply) fs.writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
  else assert(fs.existsSync(path) && fs.readFileSync(path, 'utf8') === content, 'Backup absent or production meters changed since preflight');
  return sha(content);
}

async function run() {
  const data = source();
  const rows = data.readings;
  if (process.env.VALIDATE_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ mode: 'SOURCE_VALIDATED', count: rows.length, identifiers: data.identifiers.length,
      targets: rows.reduce((counts, row) => ({ ...counts, [row.target]: (counts[row.target] || 0) + 1 }), {}),
    }, null, 2));
    return;
  }
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient();
  const state = await preflight(data);
  const plan = state.planned.map(({ row, meterId, existingId, missingMeter }) => ({ target: row.target, serial: row.serial, type: row.type, date: row.date, value: row.value, meterId, createHistoricalMeter: !!missingMeter, existingId }));
  console.log(JSON.stringify({ mode: process.env.APPLY === '1' ? 'APPLY' : 'DRY_RUN', plan, identifiers: state.identifiers }, null, 2));
  if (process.env.APPLY !== '1') {
    if (process.env.BACKUP_PATH) console.log(`Backup SHA-256 ${backup(state, process.env.BACKUP_PATH, false)}`);
    return;
  }
  const digest = backup(state, process.env.BACKUP_PATH, true);
  assert(process.env.DURABLE_BACKUP_CONFIRMED === digest, 'Confirm durable backup SHA-256 before APPLY');
  const created = await db.$transaction(async tx => {
    const result = [];
    const newMeterIds = new Map();
    for (const { row, meterId, unitId, missingMeter, existingId } of state.planned) {
      if (existingId) continue;
      let targetMeterId = meterId;
      if (missingMeter) {
        const key = [row.target, row.serial, row.type].join('|');
        if (!newMeterIds.has(key)) {
          const meter = await tx.meter.create({ data: {
            propertyId: state.property.id, unitId, scope: 'UNIT', serialNumber: row.serial,
            type: row.type, unitOfMeasure: missingMeter.unitOfMeasure, label: missingMeter.label, active: false,
            supplyPointId: state.identifiers.find(x => x.item.target === row.target && x.item.serial === row.serial && x.item.type === row.type)?.item.value || null,
          } });
          newMeterIds.set(key, meter.id);
        }
        targetMeterId = newMeterIds.get(key);
      }
      const reading = await tx.meterReading.create({ data: {
        meterId: targetMeterId, readAt: instant(row.date), value: row.value, method: 'LEGACY',
        note: `Převzato z REpilot: ${row.note}; původní způsob odečtu nezjištěn.`,
      } });
      result.push({ id: reading.id, meterId: targetMeterId, date: row.date, value: row.value });
    }
    for (const { item, meterId } of state.identifiers) {
      if (meterId) await tx.meter.update({ where: { id: meterId }, data: { supplyPointId: item.value } });
      else assert(newMeterIds.has([item.target, item.serial, item.type].join('|')), 'Missing historical meter was not created');
    }
    return result;
  });
  console.log(JSON.stringify({ mode: 'APPLIED', created }, null, 2));
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db?.$disconnect());
