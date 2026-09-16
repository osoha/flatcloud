import { test, expect } from '@playwright/test';
import { ensureForecastTestHouse } from '../prisma/seed-forecast-test-house';
import { FORECAST_QA_TAG } from '../lib/reporting/forecast-test-house';
test('R27B: fixed-term house seed is idempotent; chart explains expirations and preserves archive', async ({page}) => {
  if (!process.env.DATABASE_URL || !['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Isolated DB required');
  const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
  const previous=process.env.FORECAST_QA_CONFIRM;process.env.FORECAST_QA_CONFIRM=FORECAST_QA_TAG;
  let restore: { propertyId: string; active: boolean } | undefined;
  try {
    const house=await ensureForecastTestHouse(db);
    restore = { propertyId: house.propertyId, active: house.active };
    const leases=await db.lease.findMany({where:{unit:{propertyId:house.propertyId}},orderBy:{id:'asc'}});
    expect(leases).toHaveLength(12);
    expect(leases.filter(row=>row.endDate)).toHaveLength(10);
    expect(leases.every(row=>row.autoChargesEnabled===false)).toBe(true);
    const before=JSON.stringify(leases);
    const again=await ensureForecastTestHouse(db,new Date('2040-01-01T12:00:00Z'));
    expect(again.created).toBe(false);
    expect(JSON.stringify(await db.lease.findMany({where:{unit:{propertyId:house.propertyId}},orderBy:{id:'asc'}}))).toBe(before);
    expect(await db.charge.count({where:{lease:{unit:{propertyId:house.propertyId}}}})).toBe(0);
    expect(await db.auditLog.count({where:{propertyId:house.propertyId,action:'FORECAST_QA_HOUSE_CREATED'}})).toBe(1);
    await page.goto('/login');await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL||'e2e.admin@flatcloud.test');await page.getByLabel('Heslo').fill(process.env.E2E_ADMIN_PASSWORD||'FlatCloud-E2E-Only-Password-2026');await page.getByRole('button',{name:'Přihlásit se',exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/reporty?view=forecast&properties=${house.propertyId}&horizon=12`);
    const summary=page.getByTestId('forecast-lease-summary');
    await expect(summary).toContainText('Doba neurčitá: 2');await expect(summary).toContainText('Končí v období: 8');await expect(summary).toContainText('Končí po období: 2');
    await page.getByRole('link',{name:'36 měsíců',exact:true}).click();await expect(summary).toContainText('Končí v období: 10');await expect(summary).toContainText('Končí po období: 0');
    await page.setViewportSize({width:390,height:844});await expect(summary).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await db.property.update({where:{id:house.propertyId},data:{active:false}});
    expect((await ensureForecastTestHouse(db)).active).toBe(false);
    expect(await db.lease.count({where:{unit:{propertyId:house.propertyId}}})).toBe(12);
  } finally {if(restore) await db.property.update({where:{id:restore.propertyId},data:{active:restore.active}});if(previous===undefined)delete process.env.FORECAST_QA_CONFIRM;else process.env.FORECAST_QA_CONFIRM=previous;await db.$disconnect();}
});
