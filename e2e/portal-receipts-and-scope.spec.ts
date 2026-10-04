import {test,expect,Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {randomUUID} from "node:crypto";
import {periodLabel} from "../lib/period";
const db=new PrismaClient(),password="Portal-Receipts-Isolated-2026";
test.beforeAll(()=>{if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated CI database required");});
test.afterAll(()=>db.$disconnect());
async function login(page:Page,email:string){await page.goto("/login");await page.getByLabel("E-mail").fill(email);await page.getByLabel("Heslo").fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test("signed receipts use received payments, stay archived, and scoped previews cannot write or see other units",async({page,browser},info)=>{
 test.setTimeout(90000);
 const tag=randomUUID(),hash=await bcrypt.hash(password,8);
 const manager=await db.user.create({data:{email:`receipt-manager-${tag}@flatcloud.test`,name:"Ondřej Testovací",phone:"+420777123456",passwordHash:hash,role:"PROPERTY_MANAGER",isTestIdentity:true}});
 const viewer=await db.user.create({data:{email:`receipt-viewer-${tag}@flatcloud.test`,name:"Pouze čtení",passwordHash:hash,role:"OWNER_VIEWER",allProperties:true,isTestIdentity:true}});
 const account=await db.user.create({data:{email:`receipt-tenant-${tag}@flatcloud.test`,name:"Jana Testovací",passwordHash:hash,role:"TENANT",isTestIdentity:true}});
 const owner=await db.owner.create({data:{name:`Vlastník ${tag}`}});
 const property=await db.property.create({data:{ownerId:owner.id,managerId:manager.id,name:`Dům ${tag}`,address:"Testovací 12",city:"Praha"}});
 const unit=await db.unit.create({data:{propertyId:property.id,label:"Byt 1"}}),hidden=await db.unit.create({data:{propertyId:property.id,label:"Utajená jednotka 2"}});
 await db.userUnit.create({data:{userId:manager.id,unitId:unit.id,permission:"EDIT"}});
 const tenant=await db.tenant.create({data:{name:"Jana Testovací",email:account.email,address:"Testovací adresa 12"}});
 const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2025-01-01T12:00Z"),financialTrackingFromPeriod:"2025-01",rentCents:1000000,servicesCents:250000,variableSymbol:"9142601"}});
 const hiddenLease=await db.lease.create({data:{unitId:hidden.id,tenantId:tenant.id,startDate:new Date("2025-01-01T12:00Z"),financialTrackingFromPeriod:"2025-01",rentCents:1000000,servicesCents:0,variableSymbol:"9142602"}});
 const bank=await db.bankAccount.create({data:{propertyId:property.id,ownerId:owner.id,provider:"qa",bankName:"Testovací banka",ibanMasked:"QA",externalAccountId:tag}});
 const paid=await db.charge.create({data:{leaseId:lease.id,period:"2026-01",dueDate:new Date("2026-01-05T12:00Z"),amountCents:1250000,items:{create:[{name:"Nájemné",category:"RENT",amountCents:1000000},{name:"Zálohy na vodu",category:"WATER",amountCents:250000}]}}});
 const partial=await db.charge.create({data:{leaseId:lease.id,period:"2026-02",dueDate:new Date("2026-02-05T12:00Z"),amountCents:1250000}});
 const future=await db.charge.create({data:{leaseId:lease.id,period:"2099-01",dueDate:new Date("2099-01-05T12:00Z"),amountCents:1250000}});
 const transactions=await Promise.all([500000,750000,100000].map((amountCents,i)=>db.bankTransaction.create({data:{bankAccountId:bank.id,externalId:`${tag}-${i}`,bookedAt:new Date(`2026-01-${i===0?"04":"05"}T12:00Z`),amountCents,status:"MATCHED",allocations:{create:{chargeId:i<2?paid.id:partial.id,amountCents}}}})));
 const ownerAccount=await db.ownerBankAccount.create({data:{ownerId:owner.id,accountNumber:"123456789",bankCode:"0100"}});await db.lease.update({where:{id:lease.id},data:{ownerBankAccountId:ownerAccount.id}});
 const tenantPage=await browser.newPage(),viewerPage=await browser.newPage();
 try{
  await login(page,manager.email);
  await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}`);await expect(page.locator(".unit-portal-access")).toContainText("Dosud nepozván");
  await page.locator(".unit-portal-access").getByRole("link",{name:"Prohlédnout očima nájemníka"}).click();
  await expect(page.locator("main")).toContainText("Byt 1");await expect(page.locator("main")).not.toContainText(hidden.label);
  await expect(page.getByRole("button",{name:"Předat závadu"})).toHaveCount(0);
  expect((await page.request.post(`/api/portal/tenants/${tenant.id}/receipts`,{form:{chargeId:paid.id},maxRedirects:0})).status()).toBe(303);
  expect(await db.tenantPaymentReceipt.count({where:{chargeId:paid.id}})).toBe(0);
  await login(viewerPage,viewer.email);expect((await viewerPage.goto(`/portal/najemnik/${tenant.id}`))?.status()).toBe(404);
  await viewerPage.request.post(`/api/tenants/${tenant.id}/portal-invite`,{maxRedirects:0});expect(await db.userInvitation.count({where:{tenantId:tenant.id}})).toBe(0);
  await db.userInvitation.create({data:{email:account.email,tenantId:tenant.id,propertyId:property.id,role:"TENANT",permission:"VIEW",invitedById:manager.id,tokenHash:tag,expiresAt:new Date(Date.now()+86400000)}});
  await page.goto(`/najemnici/${tenant.id}`);await expect(page.locator("#portal .portal-access-badge")).toContainText("Čeká na přijetí");
  await db.tenantPortalAccess.create({data:{userId:account.id,tenantId:tenant.id}});
  await page.reload();await expect(page.locator("#portal .portal-access-badge")).toContainText("Portál aktivní");
  await page.goto("/ucet#podpis");await page.getByLabel("Adresa vystavitele").fill("Testovací 12, Praha");
  const signature=await sharp(Buffer.from('<svg width="500" height="140"><rect width="500" height="140" fill="white"/><path d="M30 90 Q80 10 100 80 T200 80 Q260 0 270 100 L420 75" fill="none" stroke="black" stroke-width="4"/></svg>')).png().toBuffer();
  await page.locator('input[name=signature]').setInputFiles({name:"qa-signature.png",mimeType:"image/png",buffer:signature});
  await expect(page.getByAltText("Náhled nahraného podpisu")).toBeVisible();
  await page.getByRole("checkbox",{name:/Jsem oprávněn/}).check();await page.getByRole("button",{name:"Uložit podpis a vystavování"}).click();
  await expect(page.getByAltText("Uložený podpis vystavitele")).toBeVisible();
  await login(tenantPage,account.email);await tenantPage.goto(`/portal/najemnik/${tenant.id}`);
  await expect(tenantPage.getByRole("heading",{level:1})).toHaveText("Dobrý den, Jano!");
  const choices=tenantPage.locator(`select[name=chargeId] option`);await expect(choices).toHaveCount(1);await expect(choices).toContainText(periodLabel(paid.period));
  await expect(tenantPage.locator(".portal-payment-history tr.portal-paid")).toContainText("Připsáno");await expect(tenantPage.locator(".portal-payment-history tr.portal-overdue")).toContainText("Částečně");
  await expect(tenantPage.locator(".portal-payment-history tr.portal-scheduled")).toContainText("2099");
  await expect(tenantPage.locator(".tenant-portal-call").first()).toHaveAttribute("href",`tel:${manager.phone}`);
  expect((await tenantPage.request.post("/api/account/receipt-signature",{form:{issuerName:"Podvrh",issuerAddress:"Podvrh",issuanceEnabled:"on"},maxRedirects:0})).status()).toBe(403);
  for(const chargeId of [partial.id,future.id]){await tenantPage.request.post(`/api/portal/tenants/${tenant.id}/receipts`,{form:{chargeId},maxRedirects:0});expect(await db.tenantPaymentReceipt.count({where:{chargeId}})).toBe(0);}
  const issued=await tenantPage.request.post(`/api/portal/tenants/${tenant.id}/receipts`,{form:{chargeId:paid.id},maxRedirects:0});expect(issued.status()).toBe(303);
  const location=issued.headers().location;expect(location).toContain("/receipts/D-");
  const pdf=await tenantPage.request.get(location);expect(pdf.status()).toBe(200);expect((await pdf.body()).subarray(0,4).toString()).toBe("%PDF");
  const stored=await db.tenantPaymentReceipt.findFirstOrThrow({where:{chargeId:paid.id}});expect(stored.issuerId).toBe(manager.id);expect(stored.snapshot).toMatchObject({amountCents:1250000,tenantName:tenant.name,items:[{name:"Nájemné",amountCents:1000000},{name:"Zálohy na vodu",amountCents:250000}]});
  const repeated=await tenantPage.request.post(`/api/portal/tenants/${tenant.id}/receipts`,{form:{chargeId:paid.id},maxRedirects:0});expect(repeated.headers().location).toBe(location);expect(await db.tenantPaymentReceipt.count({where:{chargeId:paid.id}})).toBe(1);
  await db.user.update({where:{id:manager.id},data:{receiptSignatureData:null,receiptIssuanceEnabled:false}});expect(await (await tenantPage.request.get(location)).body()).toEqual(await pdf.body());
  expect((await viewerPage.request.get(location)).status()).toBe(404);
  await tenantPage.reload();await expect(tenantPage.locator(".portal-document-list")).toContainText("stáhnout PDF");
  await tenantPage.screenshot({path:info.outputPath("tenant-portal-desktop.png"),fullPage:true});
  await info.attach("receipt.pdf",{body:await pdf.body(),contentType:"application/pdf"});
  await tenantPage.setViewportSize({width:390,height:844});expect(await tenantPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await tenantPage.screenshot({path:info.outputPath("tenant-portal-mobile.png"),fullPage:true});
 }finally{
  await tenantPage.close();await viewerPage.close();await db.tenantPaymentReceipt.deleteMany({where:{chargeId:paid.id}});await db.userInvitation.deleteMany({where:{tenantId:tenant.id}});await db.auditLog.deleteMany({where:{userId:{in:[account.id,manager.id,viewer.id]}}});await db.tenantPortalAccess.deleteMany({where:{tenantId:tenant.id}});await db.charge.deleteMany({where:{leaseId:{in:[lease.id,hiddenLease.id]}}});await db.bankTransaction.deleteMany({where:{id:{in:transactions.map(t=>t.id)}}});await db.bankAccount.delete({where:{id:bank.id}});await db.lease.deleteMany({where:{id:{in:[lease.id,hiddenLease.id]}}});await db.tenant.delete({where:{id:tenant.id}});await db.unit.deleteMany({where:{propertyId:property.id}});await db.property.delete({where:{id:property.id}});await db.ownerBankAccount.delete({where:{id:ownerAccount.id}});await db.owner.delete({where:{id:owner.id}});await db.user.deleteMany({where:{id:{in:[account.id,manager.id,viewer.id]}}});
 }
});

test("Basic preserves selected property, badges match open tasks and completed work stays in archive",async({page})=>{
 const tag=randomUUID(),hash=await bcrypt.hash(password,8);
 const user=await db.user.create({data:{email:`scope-${tag}@flatcloud.test`,name:"Ondřej Testovací",passwordHash:hash,role:"PROPERTY_MANAGER",defaultDisplayMode:"basic",isTestIdentity:true}});
 const owner=await db.owner.create({data:{name:`Scope owner ${tag}`}});
 const selected=await db.property.create({data:{ownerId:owner.id,name:`Vybraný ${tag}`,address:"Test 1",city:"Praha",memberships:{create:{userId:user.id,permission:"EDIT"}}}});
 const other=await db.property.create({data:{ownerId:owner.id,name:`Jiný ${tag}`,address:"Test 2",city:"Praha",memberships:{create:{userId:user.id,permission:"EDIT"}}}});
 const archived=await db.property.create({data:{ownerId:owner.id,name:`Archiv ${tag}`,address:"Test 3",city:"Praha",active:false,memberships:{create:{userId:user.id,permission:"EDIT"}}}});
 const open=await db.task.create({data:{title:`Otevřený ${tag}`,propertyId:selected.id,createdById:user.id,status:"OPEN"}});
 const done=await db.task.create({data:{title:`Hotový ${tag}`,propertyId:selected.id,createdById:user.id,status:"DONE",closedAt:new Date()}});
 const foreign=await db.task.create({data:{title:`Jiný úkol ${tag}`,propertyId:other.id,createdById:user.id,status:"OPEN"}});
 try{
  await login(page,user.email);await page.goto(`/portfolio?properties=${selected.id}`);
  await expect(page.locator(".basic-hero h1")).toHaveText("Dobrý den, Ondřeji!");
  await expect(page.locator(".scope-picker-trigger").first()).toContainText("1 z 3");
  await expect(page.locator('.sidebar a[aria-label="Úkoly"] .nav-count')).toHaveText("1");
  await expect(page.locator('.sidebar a[aria-label="Bankovní pohyby"]')).toHaveCount(0);
  await page.locator(".basic-tasks").click();await expect(page).toHaveURL(new RegExp(`properties=${selected.id}`));
  await expect(page.locator(".basic-section-list")).toContainText(open.title);await expect(page.locator(".basic-section-list")).not.toContainText(done.title);await expect(page.locator(".basic-section-list")).not.toContainText(foreign.title);
  await expect(page.locator(".scope-picker-trigger").first()).toContainText("1 z 3");
  await page.locator('.sidebar a[aria-label="Dokumenty"]').click();await expect(page).toHaveURL(new RegExp(`properties=${selected.id}`));
  await page.locator(".basic-section-filter summary").click();await page.locator('form[method="get"] input[name=q]').fill("nenalezeno");await page.locator('form[method="get"] button').first().click();await expect(page).toHaveURL(new RegExp(`properties=${selected.id}`));
  await page.locator('.sidebar a[aria-label="Úkoly"]').click();await expect(page).toHaveURL(new RegExp(`properties=${selected.id}`));
  await page.getByRole("link",{name:"Archiv",exact:true}).click();await expect(page.locator(".basic-section-list")).toContainText(done.title);
  await expect(page.locator(".basic-section-list")).not.toContainText(open.title);
  // Applying ALL at Tasks must clear the remembered subset, as it does at Portfolio.
  await page.goto("/ukoly");await page.locator('.sidebar a[aria-label="Dokumenty"]').click();await expect(page).toHaveURL(/\/dokumenty$/);
 }finally{await db.task.deleteMany({where:{id:{in:[open.id,done.id,foreign.id]}}});await db.property.deleteMany({where:{id:{in:[selected.id,other.id,archived.id]}}});await db.owner.delete({where:{id:owner.id}});await db.user.delete({where:{id:user.id}});}
});
