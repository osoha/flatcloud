import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {PDFDocument} from "pdf-lib";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {contractFacts,contractSupplement} from "../scripts/lease-contract-fixture";

const db=new PrismaClient(),password="Lease-Contract-Isolated-QA-2026";
test.beforeAll(()=>{
  if(!process.env.DATABASE_URL || !["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
});
test.afterAll(()=>db.$disconnect());
async function fixture(){
  const tag=randomUUID(),hash=await bcrypt.hash(password,8);
  const admin=await db.user.create({data:{email:`contract-${tag}@flatcloud.test`,name:"TEST Generátor QA",passwordHash:hash,role:"SUPER_ADMIN",isTestIdentity:true}});
  const reader=await db.user.create({data:{email:`contract-reader-${tag}@flatcloud.test`,name:"TEST Čtenář",passwordHash:hash,role:"PROPERTY_MANAGER",isTestIdentity:true}});
  const owner=await db.owner.create({data:{name:"TEST Pronajímatel",userId:admin.id}});
  const account=await db.ownerBankAccount.create({data:{ownerId:owner.id,accountNumber:"123456789/0800"}});
  const property=await db.property.create({data:{name:`TEST Generátor ${tag}`,address:"Testovací 125",city:"Plzeň",ownerId:owner.id,managerId:admin.id}});
  const unit=await db.unit.create({data:{propertyId:property.id,label:"Byt 12",areaM2:62.5}});
  const tenant=await db.tenant.create({data:{name:contractFacts.tenantName,dateOfBirth:new Date("1990-03-12T00:00:00Z"),address:contractSupplement.tenantAddress,email:contractSupplement.tenantEmail,phone:contractSupplement.tenantPhone}});
  const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,contractNumber:`TEST-${tag}`,startDate:new Date("2026-11-01T12:00:00Z"),endDate:new Date("2027-10-31T12:00:00Z"),financialTrackingFromPeriod:"2026-11",rentCents:1500000,servicesCents:260050,depositCents:3000000,variableSymbol:"123412",ownerBankAccountId:account.id}});
  await db.securityDepositTerm.create({data:{leaseId:lease.id,effectiveFrom:lease.startDate,agreedAmountCents:3000000,annualRateBps:275}});
  await db.securityDepositTerm.create({data:{leaseId:lease.id,effectiveFrom:new Date("2027-12-01T12:00:00Z"),agreedAmountCents:3000000,annualRateBps:400}});
  for(const item of contractSupplement.services)await db.leasePaymentItem.create({data:{leaseId:lease.id,name:item.name,amountCents:item.amountCents,category:"SERVICES",validFrom:lease.startDate}});
  const asset=await db.fileAsset.create({data:{storageKey:`qa-contract-${tag}.pdf`,originalName:"uzavrena-smlouva.pdf",mimeType:"application/pdf",sizeBytes:123,sha256:"original-unchanged",uploadedById:admin.id}});
  const document=await db.document.create({data:{propertyId:property.id,unitId:unit.id,leaseId:lease.id,fileAssetId:asset.id,category:"CONTRACT",title:"TEST Dříve vydaná smlouva",createdById:admin.id}});
  return {admin,reader,owner,account,property,unit,tenant,lease,asset,document};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){
  await db.document.delete({where:{id:f.document.id}});await db.fileAsset.delete({where:{id:f.asset.id}});
  await db.lease.delete({where:{id:f.lease.id}});await db.tenant.delete({where:{id:f.tenant.id}});await db.unit.delete({where:{id:f.unit.id}});
  await db.property.delete({where:{id:f.property.id}});await db.owner.delete({where:{id:f.owner.id}});
  await db.auditLog.deleteMany({where:{userId:{in:[f.admin.id,f.reader.id]}}});await db.user.deleteMany({where:{id:{in:[f.admin.id,f.reader.id]}}});
}
async function login(page:import("@playwright/test").Page,email:string){await page.goto("/login");await page.getByLabel("E-mail").fill(email);await page.getByLabel("Heslo").fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
// Chromium accepts Secure cookies on loopback; the API client needs them explicitly.
async function sessionHeaders(page:import("@playwright/test").Page){return {Cookie:(await page.context().cookies()).map(x=>`${x.name}=${x.value}`).join("; ")};}
function payload(){
  const value=new URLSearchParams();for(const [key,v] of Object.entries(contractSupplement)) if(key!=="services")value.set(key,key==="confirmedTestRecord"?"on":String(v));
  contractSupplement.services.forEach(x=>{value.append("serviceName",x.name);value.append("serviceAmount",String(x.amountCents/100));});return value;
}

test("complete preview uses saved financial terms and preserves issued documents",async({page},info)=>{
  test.setTimeout(120000);const f=await fixture();
  try{
    await login(page,f.admin.email);await page.goto(`/smlouvy/${f.lease.id}`);
    await page.getByRole("link",{name:"Připravit náhled nájemní smlouvy",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Náhled nájemní smlouvy",exact:true})).toBeVisible();
    await expect(page.getByText("2,75 % ročně",{exact:true})).toBeVisible();
    await expect(page.getByText("2\u00a0600,50 Kč",{exact:true})).toBeVisible();
    await expect(page.getByText("17\u00a0600,50 Kč",{exact:true})).toBeVisible();
    const form=page.locator('form[action$="/contract-preview"]');
    for(const [key,v] of Object.entries(contractSupplement)){
      if(["services","confirmedTestRecord"].includes(key))continue;
      if(key==="landlordKind")await form.locator(`[name="${key}"]`).selectOption(String(v));
      else await form.locator(`[name="${key}"]`).fill(String(v));
    }
    await form.locator('[name="confirmedTestRecord"]').check();
    await expect(form.getByRole("button",{name:"Vytvořit náhled kompletní smlouvy PDF",exact:true})).toBeEnabled();
    await page.screenshot({path:info.outputPath("form-desktop.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath("form-mobile.png"),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const body=await form.evaluate(el=>new URLSearchParams(new FormData(el as HTMLFormElement) as unknown as Record<string,string>).toString());
    const before=await db.lease.findUnique({where:{id:f.lease.id}});
    const headers={...await sessionHeaders(page),"Content-Type":"application/x-www-form-urlencoded",Origin:new URL(page.url()).origin};
    const response=await page.request.post(`/api/leases/${f.lease.id}/contract-preview`,{data:body,headers});
    expect(response.status(),response.ok()?"Complete PDF":await response.text()).toBe(200);expect(response.headers()["cache-control"]).toBe("private, no-store");
    const bytes=await response.body();expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
    await writeFile(info.outputPath("actual-preview.pdf"),bytes);
    expect(await db.lease.findUnique({where:{id:f.lease.id}})).toEqual(before);
    expect(await db.document.findUnique({where:{id:f.document.id}})).toEqual(f.document);
    expect(await db.fileAsset.findUnique({where:{id:f.asset.id}})).toEqual(f.asset);
    expect(await db.document.count({where:{leaseId:f.lease.id}})).toBe(1);
    const invalid=payload();invalid.set("serviceAmount","1");
    expect((await page.request.post(`/api/leases/${f.lease.id}/contract-preview`,{data:invalid.toString(),headers})).status()).toBe(422);
    expect((await page.request.post(`/api/leases/${f.lease.id}/contract-preview`,{data:body,headers:{...headers,Origin:"https://untrusted.invalid"}})).status()).toBe(403);
    await db.lease.update({where:{id:f.lease.id},data:{contractNumber:"REAL-1"}});await page.reload();await expect(page.getByRole("heading",{name:"Náhled nájemní smlouvy",exact:true})).toHaveCount(0);
  }finally{await cleanup(f)}
});
test("foreign lease and anonymous requests cannot preview",async({page,request})=>{
  const f=await fixture();try{
    const endpoint=`/api/leases/${f.lease.id}/contract-preview`;
    expect((await request.post(endpoint,{data:payload().toString(),headers:{"Content-Type":"application/x-www-form-urlencoded",Origin:"http://127.0.0.1:3100"}})).status()).toBe(404);
    await login(page,f.reader.email);await page.goto(`/smlouvy/${f.lease.id}/nahled-smlouvy`);
    await expect(page.getByRole("heading",{name:"Náhled nájemní smlouvy",exact:true})).toHaveCount(0);
    expect((await page.request.post(endpoint,{data:payload().toString(),headers:{...await sessionHeaders(page),"Content-Type":"application/x-www-form-urlencoded",Origin:new URL(page.url()).origin}})).status()).toBe(404);
  }finally{await cleanup(f)}
});
