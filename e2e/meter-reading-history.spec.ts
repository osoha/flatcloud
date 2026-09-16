import {test,expect} from '@playwright/test';
import {PrismaClient} from '@prisma/client';

test('R26C1: reading evidence, estimate and correction preserve the original',async({page})=>{
 const url=process.env.DATABASE_URL;if(!url||!['localhost','127.0.0.1','postgres'].includes(new URL(url).hostname))throw new Error('Isolated CI database required');
 const db=new PrismaClient();
 try{
 const tag=`R24_AGENT_QA_2026_09 R26C ${crypto.randomUUID().slice(0,8)}`;
 const email=process.env.E2E_ADMIN_EMAIL||'e2e.admin@flatcloud.test',admin=await db.user.findUniqueOrThrow({where:{email}});
 const owner=await db.owner.create({data:{name:tag}}),property=await db.property.create({data:{ownerId:owner.id,name:tag,address:'Syntetická 26',city:'Praha'}}),unit=await db.unit.create({data:{propertyId:property.id,label:'QA'}});
 const meter=await db.meter.create({data:{unitId:unit.id,type:'COLD_WATER',unitOfMeasure:'m³',label:tag}});
 const asset=await db.fileAsset.create({data:{storageKey:tag,originalName:'qa.pdf',mimeType:'application/pdf',sizeBytes:10,sha256:tag,uploadedById:admin.id}});
 const doc=await db.document.create({data:{propertyId:property.id,unitId:unit.id,fileAssetId:asset.id,title:tag,category:'OTHER',createdById:admin.id}});
 await db.meterReading.create({data:{meterId:meter.id,readAt:new Date('2025-01-01T12:00:00Z'),value:100,method:'PERSONAL',createdById:admin.id,unitOfMeasure:'m³'}});
 await page.goto('/login');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Heslo').fill(process.env.E2E_ADMIN_PASSWORD||'FlatCloud-E2E-Only-Password-2026');await page.getByRole('button',{name:'Přihlásit se',exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);
 const unitUrl=`/nemovitosti/${property.id}/jednotky/${unit.id}`;await page.goto(unitUrl);
 const card=page.locator('.meter-card').filter({has:page.getByRole('heading',{name:tag,exact:true})});
 await card.getByText('Přidat odečet',{exact:true}).click();
 const form=card.locator('form').filter({has:page.getByRole('button',{name:'Uložit odečet',exact:true})});
 await form.getByLabel('Datum odečtu',{exact:true}).fill('2025-12-31');await form.getByLabel('Stav (m³)',{exact:true}).fill('200');await form.getByLabel('Způsob odečtu').selectOption('ESTIMATE');await form.getByLabel('Poznámka / zdůvodnění odhadu').fill(`${tag} syntetický odhad`);await form.getByLabel('Fotografie nebo předávací protokol').selectOption(doc.id);await form.getByRole('button',{name:'Uložit odečet',exact:true}).click();
 await expect(page.getByText('Odečet byl uložen. Původní historie zůstává zachována.',{exact:true})).toBeVisible();
 await expect(card.getByText(/Odhad · Zapsal\/a:/)).toBeVisible();await expect(card.getByRole('link',{name:'Otevřít důkaz odečtu'})).toHaveAttribute('href',`/api/documents/${doc.id}/download`);
 await card.getByText('Opravit odečet z 2025-12-31',{exact:true}).click();
 const correction=card.locator('form').filter({has:page.getByLabel('Datum odečtu').and(page.locator('[value="2025-12-31"]'))});
 await correction.getByLabel('Stav (m³)',{exact:true}).fill('190');await correction.getByLabel('Způsob odečtu').selectOption('REMOTE');await correction.getByLabel('Důvod opravy').fill(`${tag} potvrzený dálkový odečet`);await correction.getByRole('button',{name:'Uložit opravu odečtu',exact:true}).click();
 await expect(card.locator('.meter-value strong')).toHaveText('190');await expect(card.getByText('2025-12-31 · Nahrazený záznam',{exact:true})).toBeVisible();
 const rows=await db.meterReading.findMany({where:{meterId:meter.id}});expect(rows.length).toBe(3);const revised=rows.find(r=>r.correctsId);expect(revised?.value).toBe(190);expect(revised?.evidenceDocumentId).toBe(doc.id);expect(rows.find(r=>r.id===revised?.correctsId)?.value).toBe(200);
 await card.getByRole('button',{name:'Vyřadit měřidlo',exact:true}).click();await expect(card.getByText(/Vyřazené – historie zachována/)).toBeVisible();await expect(card.locator('.meter-value strong')).toHaveText('190');
 }finally{await db.$disconnect();}
});
