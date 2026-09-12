import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma as db } from "../lib/db";
import { transferOwnership, correctOwnershipPeriod } from "../lib/ownership-transfer";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
const marker="R24_AGENT_QA_2026_09";
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date());
test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("Requires isolated CI DB");});
test.afterAll(async()=>{await db.$disconnect();});
async function login(page:Page,email:string){await page.goto("/login");await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Heslo",{exact:true}).fill(process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);}
async function fixture(){
 const actor=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.unitManager}});
 const viewer=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.externalOwner}});
 const old=await db.owner.create({data:{name:`${marker} old ${randomUUID()}`}});
 const next=await db.owner.create({data:{name:`${marker} next ${randomUUID()}`}});
 const property=await db.property.create({data:{name:`${marker} ownership ${randomUUID()}`,address:"TEST 1",city:"TEST",ownerId:old.id,communicationOwnerId:old.id,ownerships:{create:{ownerId:old.id,shareBasisPoints:10000,note:`${marker} original note`}},memberships:{create:[{userId:actor.id,permission:"EDIT"},{userId:viewer.id,permission:"VIEW"}]}}});
 const oldAccount=await db.ownerBankAccount.create({data:{ownerId:old.id,label:`${marker} old`,accountNumber:"123",bankCode:"0100"}});
 const newAccount=await db.ownerBankAccount.create({data:{ownerId:next.id,label:`${marker} next`,accountNumber:"456",bankCode:"0100"}});
 const unit=await db.unit.create({data:{propertyId:property.id,label:`${marker} U1`,ownerships:{create:{ownerId:old.id,ownerBankAccountId:oldAccount.id}}}});
 const tenant=await db.tenant.create({data:{name:`${marker} tenant`}});
 const active=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2020-01-01T12:00Z"),financialTrackingFromPeriod:"2020-01",variableSymbol:randomUUID(),rentCents:100000,servicesCents:10000,ownerBankAccountId:oldAccount.id}});
 const ended=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2018-01-01T12:00Z"),endDate:new Date("2019-12-31T12:00Z"),financialTrackingFromPeriod:"2018-01",variableSymbol:randomUUID(),rentCents:100000,servicesCents:10000,ownerBankAccountId:oldAccount.id}});
 return {actor,viewer,old,next,property,unit,oldAccount,newAccount,active,ended};
}
function form(ownerId:string,expectedOwnerId:string,extra:Record<string,string>={}){const f=new FormData();for(const [k,v]of Object.entries({ownerId,expectedOwnerId,requestId:randomUUID(),confirm:"on",reason:`${marker} confirmed source`,effectiveAt:today(),previousValidFrom:"2020-01-01",...extra}))f.set(k,v);return f;}

test("R24 ownership: UI transfer retains original row, historical periods and archive visibility",async({page})=>{
 const f=await fixture();const original=await db.propertyOwnership.findFirstOrThrow({where:{propertyId:f.property.id}});
 await login(page,R24_ROLE_USERS.unitManager);await page.goto(`/nemovitosti/${f.property.id}/vlastnici`);
 const transfer=page.locator(`form[action="/api/properties/${f.property.id}/ownerships"]`);
 await transfer.locator('select[name="ownerId"]').selectOption(f.next.id);
 await transfer.getByLabel("Původní vlastnictví od",{exact:true}).fill("2020-01-01");
 await transfer.getByLabel("Důvod a podklad změny",{exact:true}).fill(`${marker} property source`);
 await transfer.locator('input[name="confirm"]').check();
 await transfer.getByRole("button",{name:"Potvrdit převod vlastníka",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("historie zachována");
 expect((await db.propertyOwnership.findUniqueOrThrow({where:{id:original.id}})).ownerId).toBe(f.next.id);
 expect(await db.propertyOwnership.count({where:{propertyId:f.property.id}})).toBe(1);
 const periods=await db.ownershipPeriod.findMany({where:{propertyId:f.property.id,unitId:null},orderBy:{validFrom:"asc"}});
 expect(periods).toHaveLength(2);expect(periods[0].ownerId).toBe(f.old.id);expect(periods[1].ownerId).toBe(f.next.id);expect(periods[0].validTo!.getTime()+86400000).toBe(periods[1].validFrom.getTime());
 const audit=await db.auditLog.findFirstOrThrow({where:{propertyId:f.property.id,action:"OWNERSHIP_TRANSFER_CONFIRMED"}});
 expect(JSON.stringify(audit.details)).toContain(original.id);expect(JSON.stringify(audit.details)).toContain(original.note!);
 expect((await db.property.findUniqueOrThrow({where:{id:f.property.id}})).communicationOwnerId).toBe(f.old.id);
 await db.property.update({where:{id:f.property.id},data:{active:false}});
 await page.reload();await expect(page.locator('.ownership-history')).toContainText(f.old.name);await expect(page.locator('.ownership-history')).toContainText(f.next.name);
 expect(await db.userProperty.count({where:{propertyId:f.property.id}})).toBe(2);
});

test("R24 ownership: transfer leaves lease recipients intact; separate confirmation, retry and stale account",async()=>{
 const f=await fixture();const request=form(f.next.id,f.old.id);const args={propertyId:f.property.id,unitId:f.unit.id,actorId:f.actor.id,form:request};
 await transferOwnership(args);await transferOwnership(args);
 expect(await db.auditLog.count({where:{propertyId:f.property.id,action:"OWNERSHIP_TRANSFER_CONFIRMED"}})).toBe(1);
 expect((await db.lease.findUniqueOrThrow({where:{id:f.active.id}})).ownerBankAccountId).toBe(f.oldAccount.id);
 expect((await db.unitOwnership.findFirstOrThrow({where:{unitId:f.unit.id}})).ownerBankAccountId).toBeNull();
 const pay=form(f.next.id,f.next.id,{mode:"payment-recipient",ownerBankAccountId:f.newAccount.id,expectedAccountId:""});
 const paymentArgs={...args,form:pay};await transferOwnership(paymentArgs);await transferOwnership(paymentArgs);
 expect((await db.lease.findUniqueOrThrow({where:{id:f.active.id}})).ownerBankAccountId).toBe(f.newAccount.id);
 expect((await db.lease.findUniqueOrThrow({where:{id:f.ended.id}})).ownerBankAccountId).toBe(f.oldAccount.id);
 expect(await db.auditLog.count({where:{propertyId:f.property.id,action:"OWNERSHIP_PAYMENT_RECIPIENT_CONFIRMED"}})).toBe(1);
 await expect(transferOwnership({...args,form:form(f.next.id,f.next.id,{mode:"payment-recipient",ownerBankAccountId:f.newAccount.id,expectedAccountId:""})})).rejects.toThrow("mezitím");
 const audit=await db.auditLog.findFirstOrThrow({where:{propertyId:f.property.id,action:"OWNERSHIP_PAYMENT_RECIPIENT_CONFIRMED"}});expect(JSON.stringify(audit.details)).toContain(f.oldAccount.id);
});

test("R24 ownership: concurrent transfers admit one winner and reject future or invalid dates",async()=>{
 const f=await fixture();const other=await db.owner.create({data:{name:`${marker} concurrent`}});
 const call=(data:FormData)=>transferOwnership({propertyId:f.property.id,actorId:f.actor.id,form:data});
 await expect(call(form(f.next.id,f.old.id,{effectiveAt:"9999-01-01"}))).rejects.toThrow("Budoucí");
 await expect(call(form(f.next.id,f.old.id,{effectiveAt:"2026-02-31"}))).rejects.toThrow("Neplatné");
 const result=await Promise.allSettled([call(form(f.next.id,f.old.id)),call(form(other.id,f.old.id))]);
 expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(result.filter(r=>r.status==="rejected")).toHaveLength(1);
 expect(await db.ownershipPeriod.count({where:{propertyId:f.property.id}})).toBe(2);
 expect(await db.auditLog.count({where:{propertyId:f.property.id,action:"OWNERSHIP_TRANSFER_CONFIRMED"}})).toBe(1);
});

test("R24 ownership: VIEW cannot mutate, legacy deletion is blocked, correction retains old period",async({page})=>{
 const f=await fixture();await transferOwnership({propertyId:f.property.id,actorId:f.actor.id,form:form(f.next.id,f.old.id)});
 await login(page,R24_ROLE_USERS.externalOwner);await page.goto(`/nemovitosti/${f.property.id}/vlastnici`);await expect(page.getByRole("button",{name:"Potvrdit převod vlastníka"})).toHaveCount(0);
 const current=await db.propertyOwnership.findFirstOrThrow({where:{propertyId:f.property.id}});
 await page.request.post(`/api/properties/${f.property.id}/ownerships/${current.id}`,{form:{mode:"delete"}});
 expect(await db.propertyOwnership.count({where:{propertyId:f.property.id}})).toBe(1);
 await page.getByRole("button",{name:"Odhlásit",exact:true}).click();await login(page,R24_ROLE_USERS.assetManager);
 const old=await db.ownershipPeriod.findFirstOrThrow({where:{propertyId:f.property.id,ownerId:f.old.id}});
 await page.request.post('/api/reports/annual-owner-package/evidence',{form:{mode:"ownership-delete",periodId:old.id}});expect(await db.ownershipPeriod.count({where:{id:old.id}})).toBe(1);
 const correction=new FormData();for(const[k,v]of Object.entries({periodId:old.id,reason:`${marker} corrected source`,confirm:"on",validFrom:"2019-01-01",validTo:old.validTo!.toISOString().slice(0,10),expectedUpdatedAt:old.updatedAt.toISOString()}))correction.set(k,v);
 const manager=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.assetManager}});
 await correctOwnershipPeriod(manager.id,correction);
 await expect(correctOwnershipPeriod(manager.id,correction)).rejects.toThrow("mezitím");
 const event=await db.auditLog.findFirstOrThrow({where:{propertyId:f.property.id,action:"OWNERSHIP_PERIOD_CORRECTED"}});expect(JSON.stringify(event.details)).toContain(old.validFrom.toISOString());
 await page.goto(`/nemovitosti/${f.property.id}/vlastnici`);await expect(page.locator('.ownership-history')).toContainText("Oprava období");
});
