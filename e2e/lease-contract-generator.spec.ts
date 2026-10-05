import {test,expect,type Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {createServer,type Server} from "node:http";
import {leaseContractFixture} from "./fixtures/lease-contract";
import {CONTRACT_TEMPLATE_VERSION} from "../lib/lease-contracts/core";
const db=new PrismaClient(),password="Contract-QA-Only-2026",objects=new Map<string,Buffer>();let storage:Server|undefined;
test.beforeAll(async()=>{
  if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated test database required");
  if(process.env.S3_ENDPOINT==="http://127.0.0.1:3201"&&process.env.FILE_STORAGE_DRIVER==="s3"){
    storage=createServer(async(req,res)=>{const key=new URL(req.url!,"http://127.0.0.1:3201").pathname;if(req.method==="PUT"){const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));objects.set(key,Buffer.concat(chunks));res.setHeader("ETag",'"qa"');res.end();}else if(req.method==="DELETE"){objects.delete(key);res.statusCode=204;res.end();}else if(objects.has(key)){res.setHeader("Content-Type","application/pdf");res.end(req.method==="HEAD"?undefined:objects.get(key));}else{res.statusCode=404;res.end();}});
    await new Promise<void>(resolve=>storage!.listen(3201,"127.0.0.1",resolve));
  }
});
test.afterAll(async()=>{if(storage)await new Promise<void>((resolve,reject)=>storage!.close(e=>e?reject(e):resolve()));await db.$disconnect();});
async function login(page:Page,email:string){await page.goto("/login");await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Heslo",{exact:true}).fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
async function sessionHeaders(page:Page){return {Cookie:(await page.context().cookies()).map(c=>`${c.name}=${c.value}`).join("; ")};}
async function fixture(){const tag=randomUUID(),passwordHash=await bcrypt.hash(password,8);const admin=await db.user.create({data:{name:"Smlouvy QA",email:`contracts-${tag}@flatcloud.test`,role:"SUPER_ADMIN",passwordHash,isTestIdentity:true}});const viewer=await db.user.create({data:{name:"Smlouvy čtenář",email:`contracts-viewer-${tag}@flatcloud.test`,role:"OWNER_VIEWER",allProperties:true,passwordHash,isTestIdentity:true}});const owner=await db.owner.create({data:{name:"Smluvní strana QA"}});const property=await db.property.create({data:{name:"Smlouvy QA",address:"Jabloňová 25",city:"Praha",ownerId:owner.id}});const unit=await db.unit.create({data:{label:"Byt 12",propertyId:property.id,type:"APARTMENT",areaM2:54.5}});const tenant=await db.tenant.create({data:{name:"Jan Nájemník",dateOfBirth:new Date("1995-05-10T12:00:00Z"),address:"Lipová 15, Praha"}});const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2026-11-01T12:00:00Z"),endDate:new Date("2027-10-31T12:00:00Z"),financialTrackingFromPeriod:"2026-11",rentCents:1500000,depositCents:3000000,servicesCents:200000,variableSymbol:"100012",autoChargesEnabled:false}});return {admin,viewer,owner,property,unit,tenant,lease,url:`/smlouvy/${lease.id}/pripravit`,api:`/api/leases/${lease.id}/contract`};}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){const docs=await db.document.findMany({where:{leaseId:f.lease.id},select:{fileAssetId:true}});await db.document.deleteMany({where:{leaseId:f.lease.id}});await db.fileAsset.deleteMany({where:{id:{in:docs.map(d=>d.fileAssetId)}}});await db.auditLog.deleteMany({where:{userId:{in:[f.admin.id,f.viewer.id]}}});await db.lease.delete({where:{id:f.lease.id}});await db.tenant.delete({where:{id:f.tenant.id}});await db.unit.delete({where:{id:f.unit.id}});await db.property.delete({where:{id:f.property.id}});await db.owner.delete({where:{id:f.owner.id}});await db.user.deleteMany({where:{id:{in:[f.admin.id,f.viewer.id]}}});}
const payload=(mode:string,input:unknown=leaseContractFixture)=>({mode,input,version:CONTRACT_TEMPLATE_VERSION});
test("preview validates mutations without changing a lease and rejects read-only or anonymous generation",async({page,browser},info)=>{test.setTimeout(90000);const f=await fixture();try{
  const anonymous=await browser.newContext();expect((await anonymous.request.post(f.api,{data:payload("preview")})).status()).toBe(403);await anonymous.close();
  await login(page,f.admin.email);await page.goto(f.url);await expect(page.getByRole("heading",{name:"Připravit nájemní smlouvu",exact:true})).toBeVisible();await expect(page.getByLabel("Jméno / název",{exact:true})).toHaveValue(f.owner.name);
  const valid=await page.request.post(f.api,{headers:await sessionHeaders(page),data:payload("preview")});expect(valid.status()).toBe(200);const c=(await valid.json()).contract;expect(c.sections).toHaveLength(10);expect(c.signatures).toHaveLength(2);
  expect(await db.document.count({where:{leaseId:f.lease.id}})).toBe(0);expect((await db.lease.findUniqueOrThrow({where:{id:f.lease.id}})).rentCents).toBe(f.lease.rentCents);
  expect((await page.request.post(f.api,{headers:await sessionHeaders(page),data:payload("save",{...leaseContractFixture,depositCents:4500001})})).status()).toBe(422);
  expect((await page.request.post(f.api,{headers:await sessionHeaders(page),data:{...payload("save"),version:"old-version"}})).status()).toBe(409);
  expect((await page.request.post(f.api,{data:payload("save"),headers:{...await sessionHeaders(page),Origin:"https://untrusted.example"}})).status()).toBe(403);
  expect((await page.request.post("/api/admin/user-preview",{headers:await sessionHeaders(page),form:{userId:f.viewer.id},maxRedirects:0})).status()).toBe(303);
  expect((await page.request.post(f.api,{headers:await sessionHeaders(page),data:payload("save")})).status()).toBe(403);
  await page.request.post("/api/admin/user-preview/exit",{headers:await sessionHeaders(page),maxRedirects:0});
  const pdf=await page.request.post(f.api,{headers:await sessionHeaders(page),data:payload("pdf")});expect(pdf.status()).toBe(200);expect((await pdf.body()).subarray(0,5).toString()).toBe("%PDF-");await info.attach("preview-pdf",{body:await pdf.body(),contentType:"application/pdf"});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath("contract-mobile.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const context=await browser.newContext(),other=await context.newPage();await login(other,f.viewer.email);expect((await other.request.post(f.api,{headers:await sessionHeaders(other),data:payload("save")})).status()).toBe(404);await context.close();
}finally{await cleanup(f);}});
test("builder creates a fresh private unsigned PDF with an immutable template and data snapshot",async({page},info)=>{
  test.setTimeout(120000);
  test.skip(process.env.FILE_STORAGE_DRIVER!=="s3"||process.env.S3_ENDPOINT!=="http://127.0.0.1:3201","Save is verified in the dedicated isolated-storage CI step.");
  const f=await fixture();try{await login(page,f.admin.email);await page.goto(f.url);
    await page.getByLabel("Typ pronajímatele",{exact:true}).selectOption("PERSON");
    const fill:Record<string,string>={"Jméno / název":leaseContractFixture.landlord.name,"Bydliště / sídlo":leaseContractFixture.landlord.address,"Podepisující osoba":leaseContractFixture.landlord.signer,"Oprávnění podepisujícího":"osobně","Doručovací adresa":leaseContractFixture.tenants[0].deliveryAddress,"Podlaží a umístění":"3. nadzemní podlaží","Dispozice":"2+kk","Katastrální identifikace":leaseContractFixture.unit.cadastral,"Příslušenství a rozsah užívání":leaseContractFixture.unit.accessories,"Místo podpisu":"Praha","Účet / IBAN":"123456789/0800","Energie sjednané přímo nájemcem":"elektřinu","Skutečně připojené přílohy":"Žádné"};for(const [label,v]of Object.entries(fill))await page.getByLabel(label,{exact:true}).fill(v);
    await page.locator('input[type="date"]').first().fill("1975-06-14");await page.getByLabel("Datum podpisu",{exact:true}).fill("2026-10-20");await page.getByLabel("Splatnost první platby",{exact:true}).fill("2026-11-05");await page.getByLabel("Splatnost jistoty",{exact:true}).fill("2026-10-25");await page.getByLabel("Individuální úrok jistoty v % ročně",{exact:true}).fill("1.5");
    await page.getByLabel("Služba",{exact:true}).fill("Studená voda a stočné");await page.getByText("Ověřil/a jsem pronajímatele",{exact:false}).click();await page.getByRole("button",{name:"Zobrazit celý náhled",exact:true}).click();await expect(page.getByLabel("Náhled nájemní smlouvy")).toBeVisible();
    await page.screenshot({path:info.outputPath("contract-preview-desktop.png"),fullPage:true});
    await page.getByRole("button",{name:"Vytvořit PDF k podpisu a uložit",exact:true}).click();await expect(page.getByRole("heading",{name:"Smlouva je připravena k podpisu",exact:true})).toBeVisible();
    const doc=await db.document.findFirstOrThrow({where:{leaseId:f.lease.id},include:{fileAsset:true}});expect(doc.tenantVisible).toBe(false);expect(doc.unitId).toBe(f.unit.id);expect(doc.description).toContain("Smlouva není podepsaná");
    const bytes=objects.get(`/qa-documents/${doc.fileAsset.storageKey}`)!;expect(bytes.subarray(0,5).toString()).toBe("%PDF-");await info.attach("clean-contract-pdf",{body:bytes,contentType:"application/pdf"});
    const audit=await db.auditLog.findFirstOrThrow({where:{entityType:"Document",entityId:doc.id,action:"DOCUMENT_UPLOADED"}});expect(JSON.stringify(audit.details)).toContain(CONTRACT_TEMPLATE_VERSION);expect(JSON.stringify(audit.details)).toContain("1,5 % ročně");
    const originalHash=doc.fileAsset.sha256;const changed=await page.request.post(f.api,{headers:await sessionHeaders(page),data:payload("save",{...leaseContractFixture,rentCents:1600000})});expect(changed.status()).toBe(200);expect(await db.document.count({where:{leaseId:f.lease.id}})).toBe(2);expect((await db.fileAsset.findUniqueOrThrow({where:{id:doc.fileAssetId}})).sha256).toBe(originalHash);expect((await db.lease.findUniqueOrThrow({where:{id:f.lease.id}})).rentCents).toBe(1500000);
  }finally{await cleanup(f);}
});
