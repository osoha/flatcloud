import { test,expect,type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { materializeInboxPayment } from "../lib/inbound-bank/process";
import { createAccountBankRule } from "../lib/account-bank-rules";
import { bankAccountScopes } from "../lib/account-banking-access";

const db=new PrismaClient();const password="Bank-Rules-QA-Only-2026";
test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("Local/CI DB only");});
test.afterAll(()=>db.$disconnect());
async function fixture() {
  const token=randomUUID();const passwordHash=await bcrypt.hash(password,10);
  const user=await db.user.create({data:{email:`bank-owner-${token}@flatcloud.test`,name:`Bankovní vlastník QA ${token}`,passwordHash,role:"PROPERTY_MANAGER",isTestIdentity:true,onboardingStatus:"DONE"}});
  const partial=await db.user.create({data:{email:`bank-partial-${token}@flatcloud.test`,name:"Částečný správce QA",passwordHash,role:"PROPERTY_MANAGER",isTestIdentity:true,onboardingStatus:"DONE"}});
  const owner=await db.owner.create({data:{name:`Vlastník účtu QA ${token}`,userId:user.id}});
  const properties=await Promise.all([1,2].map(n=>db.property.create({data:{ownerId:owner.id,name:`Dům ${n} QA ${token}`,city:"Praha",address:`Testovací ${n}`,memberships:{create:{userId:user.id,permission:"EDIT"}}}})));
  await db.userProperty.create({data:{userId:partial.id,propertyId:properties[0].id,permission:"EDIT"}});
  const accountNumber=String(Math.floor(Math.random()*8000000000)+1000000000);
  const account=await db.ownerBankAccount.create({data:{ownerId:owner.id,label:`Sdílený QA ${token}`,accountNumber,bankCode:"3030",propertyLinks:{create:properties.map(p=>({propertyId:p.id}))}}});
  const recipientAccount=`${accountNumber}/3030`;
  const inbox=(amountCents:number,extra:Record<string,unknown>={})=>db.inboxPayment.create({data:{messageId:randomUUID(),bank:"3030",sourceTrusted:true,status:"RECEIVED",amountCents,recipientAccount,counterpartyName:`QA protistrana ${token}`,counterpartyAccount:"19-2000145399/0800",message:"Správa a vedení",bookedAt:new Date("2026-01-15T12:00:00Z"),...extra}});
  return {token,user,partial,owner,properties,account,recipientAccount,inbox};
}
async function login(page:Page,email:string) {
  await page.goto("/login");await page.getByLabel("E-mail").fill(email);await page.getByLabel("Heslo").fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);
}

test("shared account owner can find ignored mail and create a scoped rule; partial manager cannot access it",async({page,browser})=>{
  const f=await fixture();const row=await f.inbox(-40000);
  expect((await materializeInboxPayment(row.id)).imported).toBe(false);
  expect((await db.task.findUniqueOrThrow({where:{dedupeKey:`bank-review:inbox:${row.id}`}})).assigneeId).toBe(f.user.id);
  const historical=await f.inbox(-30000,{status:"IGNORED",message:"Dříve ručně ignorováno"});
  await login(page,f.user.email);await page.goto("/platby/banka");
  await expect(page.locator(`a[href='/platby/nesparovane/email/${row.id}']`)).toBeVisible();
  await page.locator(`a[href='/platby/nesparovane/email/${row.id}']`).click();
  await page.getByRole("button",{name:"Ignorovat a připravit pravidlo",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/platby/banka/pravidla\\?inbox=${row.id}`));
  await expect(page.getByLabel("Částka (volitelná)")).toHaveValue("400.00");
  await expect(page.getByLabel("Směr pohybu *")).toHaveValue("OUT");
  await page.getByLabel("Název pravidla *").fill(`Ignorace vedení ${f.token}`);
  await page.getByRole("button",{name:"Uložit pravidlo účtu",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Pravidlo účtu bylo uloženo");
  const rule=await db.accountBankRule.findFirstOrThrow({where:{ownerBankAccountId:f.account.id}});
  expect(rule.action).toBe("IGNORE");expect(rule.targetLeaseId).toBeNull();
  const future=await f.inbox(-40000);expect((await materializeInboxPayment(future.id)).ignored).toBe(true);
  expect((await db.inboxPayment.findUniqueOrThrow({where:{id:future.id}})).propertyId).toBeNull();
  expect(await db.bankTransaction.count({where:{inboxPayment:{id:future.id}}})).toBe(0);
  const incoming=await f.inbox(40000);expect((await materializeInboxPayment(incoming.id)).ignored).not.toBe(true);
  const foreign=await db.ownerBankAccount.create({data:{ownerId:f.owner.id,accountNumber:String(Number(f.account.accountNumber)+1),bankCode:"3030"}});
  const foreignRow=await f.inbox(-40000,{recipientAccount:`${foreign.accountNumber}/3030`});expect((await materializeInboxPayment(foreignRow.id)).ignored).not.toBe(true);
  await page.goto("/platby/banka?stav=ignorovane");
  await expect(page.locator(`a[href='/platby/nesparovane/email/${historical.id}']`)).toBeVisible();
  await expect(page.locator(`a[href='/platby/nesparovane/email/${row.id}']`)).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const context=await browser.newContext();const outsider=await context.newPage();await login(outsider,f.partial.email);
  expect(await bankAccountScopes(f.partial)).toHaveLength(0);
  await outsider.goto("/platby/banka");await expect(outsider.locator(`a[href='/platby/nesparovane/email/${row.id}']`)).toHaveCount(0);
  expect((await outsider.goto(`/platby/nesparovane/email/${row.id}`))?.status()).toBe(404);
  await outsider.request.post(`/api/bank-account-rules/${rule.id}`,{form:{active:"0"}});
  expect((await db.accountBankRule.findUniqueOrThrow({where:{id:rule.id}})).active).toBe(true);
  await outsider.request.post(`/api/inbound-payments/${incoming.id}/ignore`,{form:{createRule:"1"}});
  expect((await db.inboxPayment.findUniqueOrThrow({where:{id:incoming.id}})).status).toBe("UNMATCHED");
  await outsider.request.post("/api/bank-account-rules",{form:{accountId:f.account.id,name:"Unauthorized",direction:"OUT",currency:"CZK",action:"IGNORE",messageContains:"Správa"}});
  expect(await db.accountBankRule.count({where:{ownerBankAccountId:f.account.id}})).toBe(1);
  await context.close();
});

test("account matching rules route across houses, suggestions stay unallocated, conflicting targets and untrusted mail stay for review",async()=>{
  const f=await fixture();
  const leases=await Promise.all(f.properties.map(async(property,n)=>{
    const unit=await db.unit.create({data:{propertyId:property.id,label:`QA ${n+1}`}});
    const tenant=await db.tenant.create({data:{name:`Nájemce QA ${n+1} ${f.token}`}});
    const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,ownerBankAccountId:f.account.id,variableSymbol:`${n+1}${f.token.replace(/\D/g,"").slice(0,8)}`,startDate:new Date("2020-01-01T12:00:00Z"),financialTrackingFromPeriod:"2020-01",rentCents:120000,servicesCents:0}});
    await db.charge.create({data:{leaseId:lease.id,period:"2020-01",dueDate:new Date("2020-01-05T12:00:00Z"),amountCents:120000}});return lease;
  }));
  const input={accountId:f.account.id,sourceId:null,name:`Párování QA ${f.token}`,direction:"IN",currency:"CZK",counterpartyAccount:"19-2000145399/0800",counterpartyNameContains:null,variableSymbol:null,messageContains:null,amountCents:null,targetLeaseId:leases[1].id,action:"MATCH_LEASE"};
  const rule=await createAccountBankRule(f.user,input);
  await expect(createAccountBankRule(f.user,input)).rejects.toThrow("Stejné pravidlo již existuje");
  const row=await f.inbox(120000);const result=await materializeInboxPayment(row.id);expect(result.imported).toBe(true);expect(result.propertyId).toBe(f.properties[1].id);
  expect(await db.paymentAllocation.count({where:{transactionId:result.transactionId,charge:{leaseId:leases[1].id}}})).toBe(1);
  await materializeInboxPayment(row.id);expect(await db.paymentAllocation.count({where:{transactionId:result.transactionId}})).toBe(1);
  const untrusted=await f.inbox(120000,{sourceTrusted:false});expect((await materializeInboxPayment(untrusted.id)).imported).toBe(false);
  const suggest=await createAccountBankRule(f.user,{...input,name:"Pouze návrh",counterpartyAccount:"123456789/0800",action:"SUGGEST_LEASE",targetLeaseId:leases[0].id});
  const suggested=await f.inbox(120000,{counterpartyAccount:"123456789/0800"});const suggestion=await materializeInboxPayment(suggested.id);
  expect((await db.bankTransaction.findUniqueOrThrow({where:{id:suggestion.transactionId}})).status).toBe("SUGGESTED");
  expect(await db.paymentAllocation.count({where:{transactionId:suggestion.transactionId}})).toBe(0);
  await db.accountBankRule.update({where:{id:suggest.id},data:{active:false}});
  expect((await materializeInboxPayment((await f.inbox(120000,{counterpartyAccount:"123456789/0800"})).id)).imported).toBe(false);
  await createAccountBankRule(f.user,{...input,name:"Jiný cíl stejné priority",targetLeaseId:leases[0].id});
  const conflict=await f.inbox(120000);expect((await materializeInboxPayment(conflict.id)).imported).toBe(false);
  await expect(db.inboxPayment.findUniqueOrThrow({where:{id:conflict.id}})).resolves.toMatchObject({status:"UNMATCHED",transactionId:null});
  expect((await db.accountBankRule.findUniqueOrThrow({where:{id:rule.id}})).active).toBe(true);
});
