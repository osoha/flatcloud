import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { emptySourceLine, validateSource } from '../lib/settlement-source-rules';

test('R26D: confirmed costs enter a marked working protocol without posting or duplicate OPEX', async ({page}) => {
  const url=process.env.DATABASE_URL;
  if(!url||!['localhost','127.0.0.1','postgres'].includes(new URL(url).hostname)) throw new Error('Isolated CI database required');
  const db=new PrismaClient();
  try {
    const tag=`R24_AGENT_QA_2026_09 R26D ${crypto.randomUUID().slice(0,8)}`;
    const email=process.env.E2E_ADMIN_EMAIL||'e2e.admin@flatcloud.test';
    const admin=await db.user.findUniqueOrThrow({where:{email}});
    const owner=await db.owner.create({data:{name:tag}});
    const property=await db.property.create({data:{ownerId:owner.id,name:tag,address:'Syntetická 26',city:'Praha'}});
    const unit=await db.unit.create({data:{propertyId:property.id,label:'QA jednotka'}});
    const tenant=await db.tenant.create({data:{name:tag}});
    const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date('2025-01-01'),financialTrackingFromPeriod:'2025-01',variableSymbol:'26',rentCents:1000000,servicesCents:100000,autoChargesEnabled:false}});
    const asset=await db.fileAsset.create({data:{storageKey:tag,originalName:'synthetic.pdf',mimeType:'application/pdf',sizeBytes:10,sha256:tag,uploadedById:admin.id}});
    const doc=await db.document.create({data:{propertyId:property.id,fileAssetId:asset.id,title:tag,category:'OTHER',createdById:admin.id}});
    const payload=validateSource({mode:'EXTERNAL_UNIT',kind:'EXTERNAL',vendor:tag,reference:'QA-EXT',from:'2025-01-01',to:'2025-12-31',supplyAmount:'12000.37',unitId:unit.id,lines:[{...emptySourceLine('2025-01-01','2025-12-31'),amount:'12000.37',unitId:unit.id,leaseId:lease.id,service:'HEATING',base:'4000',consumptionComponent:'8000.37',componentsComplete:true}]});
    await db.settlementSource.create({data:{propertyId:property.id,documentId:doc.id,identityKey:tag,version:1,payload,createdById:admin.id,confirmedById:admin.id,confirmedAt:new Date(),confirmation:{documentId:doc.id,sha256:tag}}});
    await db.propertyCost.create({data:{propertyId:property.id,unitId:unit.id,kind:'OPEX',status:'ACTUAL',category:'UTILITIES',title:tag,amountCents:1200000,effectiveAt:new Date('2025-06-01')}});
    await page.goto('/login');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Heslo').fill(process.env.E2E_ADMIN_PASSWORD||'FlatCloud-E2E-Only-Password-2026');await page.getByRole('button',{name:'Přihlásit se',exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/smlouvy/${lease.id}/vyuctovani?from=2025-01-01&to=2025-12-31`);
    await expect(page.getByRole('heading',{name:'Potvrzené podklady po službách',exact:true})).toBeVisible();
    await expect(page.getByRole('cell',{name:'2025-01-01',exact:true})).toBeVisible();
    await expect(page.getByText('Základní: 4000 Kč',{exact:true})).toBeVisible();
    await expect(page.getByText('Spotřební: 8000.37 Kč',{exact:true})).toBeVisible();
    await expect(page.locator('.settlement-summary').filter({hasText:'Skutečné náklady'})).toContainText('12 000,37');
    await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Uložit bez zaúčtování',exact:true}).click();
    await expect(page.getByText('NÁVRH — NEURČENO K ÚHRADĚ',{exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Potvrzené podklady po službách',exact:true})).toBeVisible();
    const protocol=await db.serviceSettlementProtocol.findFirstOrThrow({where:{leaseId:lease.id}});
    expect(protocol.actualCostsCents).toBe(1200037);expect(protocol.chargeId).toBeNull();expect(protocol.creditId).toBeNull();
    expect(await db.charge.count({where:{leaseId:lease.id}})).toBe(0);
    await page.goto(`/smlouvy/${lease.id}/vyuctovani?from=2025-01-01&to=2025-12-31`);
    await expect(page.locator('.settlement-protocol-history')).toContainText('2025-01-01 – 2025-12-31');
  } finally { await db.$disconnect(); }
});
