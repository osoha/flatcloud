import type { PrismaClient } from '@prisma/client';
import { FORECAST_QA_OWNER_ID, FORECAST_QA_PROPERTY_ID, FORECAST_QA_TAG, forecastTestHouse, requireForecastSeedTarget } from '../lib/reporting/forecast-test-house';
export async function ensureForecastTestHouse(db: PrismaClient, asOf = new Date()) {
  requireForecastSeedTarget(process.env);
  return db.$transaction(async tx => {
    const existing = await tx.property.findUnique({ where: { id: FORECAST_QA_PROPERTY_ID }, include: { units: { include: { leases: true } } } });
    if (existing) {
      if (existing.ownerId !== FORECAST_QA_OWNER_ID || !existing.name.includes(FORECAST_QA_TAG) || existing.units.length !== 12 || existing.units.some(unit => !unit.id.startsWith('r27b_forecast_') || unit.leases.length !== 1)) throw new Error('Testovací dům již existuje, ale jeho struktura se změnila. Automatické opravy nejsou povoleny.');
      return { propertyId: existing.id, created: false, active: existing.active };
    }
    const admin = await tx.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN', active: true } });
    const owner = await tx.owner.create({ data: { id: FORECAST_QA_OWNER_ID, name: `${FORECAST_QA_TAG} · Valuace · testovací vlastník`, affiliation: 'EXTERNAL' } });
    const property = await tx.property.create({ data: { id: FORECAST_QA_PROPERTY_ID, ownerId: owner.id, name: `${FORECAST_QA_TAG} · Valuace · smlouvy na dobu určitou`, address: 'Syntetický testovací dům V27', city: 'Testovací lokalita', flatcloudConsolidationBasisPoints: 0 } });
    for (const row of forecastTestHouse(asOf)) {
      const unit = await tx.unit.create({ data: { id: `${row.id}_unit`, propertyId: property.id, label: row.label, areaM2: 50, disposition: 'TWO_KK', type: 'APARTMENT', status: 'OCCUPIED', ownerships: { create: { ownerId: owner.id, shareBasisPoints: 10000 } } } });
      const tenant = await tx.tenant.create({ data: { id: `${row.id}_tenant`, name: `${FORECAST_QA_TAG} · Testovací nájemce ${row.label}`, payerAccounts: [], propertyLinks: { create: { propertyId: property.id } } } });
      await tx.lease.create({ data: {
        id: `${row.id}_lease`, unitId: unit.id, tenantId: tenant.id, contractNumber: `${FORECAST_QA_TAG}-${row.label}`,
        startDate: row.startDate, endDate: row.endDate, financialTrackingFromPeriod: row.startDate.toISOString().slice(0,7),
        variableSymbol: `2700${row.label.slice(1)}`, rentCents: row.rentCents, servicesCents: row.servicesCents,
        autoChargesEnabled: false, indexationEnabled: row.indexationPercentBps !== null, indexationPercentBps: row.indexationPercentBps, nextIndexationAt: row.nextIndexationAt,
        note: `${FORECAST_QA_TAG}; původní délka ${row.durationMonths ?? 'neurčitá'}; žádné automatické předpisy, platby ani e-maily.`,
        parties: { create: { tenantId: tenant.id, role: 'CONTRACTING_PARTY', isPrimary: true } },
        paymentItems: { create: [
          { name: 'Nájemné', category: 'RENT', amountCents: row.rentCents, validFrom: row.startDate, sortOrder: 10 },
          { name: 'Zálohy na služby', category: 'SERVICES', amountCents: row.servicesCents, validFrom: row.startDate, sortOrder: 20 },
        ] },
      } });
    }
    await tx.auditLog.create({ data: { userId: admin.id, propertyId: property.id, action: 'FORECAST_QA_HOUSE_CREATED', entityType: 'Property', entityId: property.id, details: { tag: FORECAST_QA_TAG, asOf: asOf.toISOString(), units: 12, fixedTerm: 10, indefinite: 2, writesCharges: false } } });
    return { propertyId: property.id, created: true, active: true };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
