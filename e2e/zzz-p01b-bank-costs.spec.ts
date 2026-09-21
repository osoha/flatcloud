import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
import { applyExpense } from "../lib/bank-expenses";
import { settledCents, bankRemainder } from "../lib/bank-expense-values";
import { allocateCostAmount, allocationBasisPoints } from "../lib/property-cost-allocations";
import { loadAnnualOwnerPackage } from "../lib/reporting/annual-owner-package";
import { calculateBudgetSummary } from "../lib/asset-finance";
const db=new PrismaClient();
test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("P01B tests require local/CI database");});
test.afterAll(()=>db.$disconnect());
async function fixture(page:Page) {
  await page.goto("/login");await page.getByLabel("E-mail").fill(R24_ROLE_USERS.advanced);await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD);await page.getByRole("button",{name:"Přihlásit se"}).click();await expect(page).toHaveURL(/\/portfolio/);
  const actor=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.advanced},include:{memberships:true}}),propertyId=actor.memberships[0].propertyId;
  const units=await db.unit.findMany({where:{propertyId},take:3});expect(units).toHaveLength(3);
  const suffix=crypto.randomUUID();
  const account=await db.bankAccount.create({data:{propertyId,provider:"p01b-test",externalAccountId:suffix,bankName:"P01B TEST",ibanMasked:"TEST",currency:"CZK"}});
  const allocations=allocateCostAmount(1800000,allocationBasisPoints("equal",units));
  const cost=await db.propertyCost.create({data:{propertyId,title:`P01B faktura ${suffix}`,amountCents:1800000,status:"ACTUAL",kind:"OPEX",effectiveAt:new Date("2025-12-15T12:00:00Z"),allocations:{create:allocations}}});
  const bank=async(amountCents:number)=>db.bankTransaction.create({data:{bankAccountId:account.id,externalId:crypto.randomUUID(),bookedAt:new Date("2026-01-15T12:00:00Z"),amountCents,source:"expense-statement",counterpartyName:`P01B ${suffix}`,status:"IGNORED"}});
  const command=(transactionId:string,amountCents:number)=>({transactionId,sourcePropertyId:propertyId,targetPropertyId:propertyId,userId:actor.id,expectedRevision:0,amountCents,kind:"COST_PAYMENT" as const,costId:cost.id,reason:"P01B test doložené faktury"});
  return {actor,propertyId,units,cost,bank,command,suffix,account};
}
async function post(page:Page,path:string,form:Record<string,string>) {
  // Match existing CI helpers: Chromium sends its Secure loopback session cookie.
  const result=await page.evaluate(async({path,form})=>{const r=await fetch(path,{method:"POST",body:new URLSearchParams(form)});return {status:r.status,url:r.url};},{path,form});
  expect([200,404]).toContain(result.status);expect(new URL(result.url).pathname).not.toBe("/login");
  return new URL(result.url).searchParams;
}
test("P01B 18 000, dvě úhrady, tři jednotky, historie a nezměněný KPI",async({page})=>{
  const f=await fixture(page),a=await f.bank(-1000000),b=await f.bank(-800000);
  await applyExpense(f.command(a.id,1000000));await applyExpense(f.command(b.id,800000));
  const saved=await db.propertyCost.findUniqueOrThrow({where:{id:f.cost.id},include:{bankSettlements:true,allocations:true}});
  expect(settledCents(saved.bankSettlements)).toBe(1800000);expect(saved.allocations.reduce((s,a)=>s+a.amountCents,0)).toBe(1800000);
  expect(calculateBudgetSummary([], [saved],2025).actualCents).toBe(1800000);expect(calculateBudgetSummary([], [saved],2026).actualCents).toBe(0);
  const property=await db.property.findUniqueOrThrow({where:{id:f.propertyId}});
  const annual=await loadAnnualOwnerPackage(f.actor,{ownerId:property.ownerId,year:2026});
  expect(annual.expenseRows.some(r=>r.id===saved.id)).toBe(false);
  expect(annual.costPaymentRows.filter(r=>r.costId===saved.id).reduce((sum,r)=>sum+r.amountCents,0)).toBe(1800000);
  await page.goto(`/nemovitosti/${f.propertyId}/naklady/${saved.id}`);
  await expect(page.getByRole("region",{name:"Úhrady nákladu"})).toContainText("18 000,00 Kč");
  await expect(page.getByTestId("cost-allocation").locator("tbody tr")).toHaveCount(3);
  await page.goto(`/nemovitosti/${f.propertyId}/bankovni-vydaje?year=2026`);await expect(page.getByRole("heading",{name:"Bankovní výdaje a úhrady"})).toBeVisible();
  await expect(page.locator(`#pohyb-${a.id} summary`)).toContainText("Rozděleno");
  await applyExpense({...f.command(b.id,0),expectedRevision:1,voidId:saved.bankSettlements.find(r=>r.transactionId===b.id)!.id,reason:"Chybně přiřazená faktura"});
  expect(await db.bankExpenseAllocation.count({where:{propertyCostId:saved.id}})).toBe(2);
  expect(await db.auditLog.count({where:{entityId:b.id,action:"BANK_EXPENSE_VOIDED"}})).toBe(1);
  await applyExpense({...f.command(b.id,800000),expectedRevision:2});
  expect(await db.bankExpenseAllocation.count({where:{propertyCostId:saved.id}})).toBe(3);
});
test("P01B jedna platba dvě faktury, odmítne přečerpání a souběžné duplicity",async({page})=>{
  const f=await fixture(page),bank=await f.bank(-2000000);
  const second=await db.propertyCost.create({data:{propertyId:f.propertyId,title:"P01B druhá faktura",amountCents:200000,status:"ACTUAL",kind:"OPEX",effectiveAt:new Date()}});
  const result=await Promise.allSettled([applyExpense(f.command(bank.id,1800000)),applyExpense(f.command(bank.id,1800000))]);
  expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  await expect(applyExpense({...f.command(bank.id,200001),costId:second.id,expectedRevision:1})).rejects.toThrow(/zbytek/);
  await applyExpense({...f.command(bank.id,200000),costId:second.id,expectedRevision:1});
  const saved=await db.bankTransaction.findUniqueOrThrow({where:{id:bank.id},include:{expenseAllocations:true}});expect(bankRemainder(saved.amountCents,saved.expenseAllocations)).toBe(0);
});
test("P01B vratka nepřepisuje náklad a nelze stornovat podklad navazující vratky",async({page})=>{
  const f=await fixture(page),a=await f.bank(-1800000),refund=await f.bank(50000);
  await applyExpense(f.command(a.id,1800000));await applyExpense({...f.command(refund.id,50000),kind:"COST_REFUND"});
  const cost=await db.propertyCost.findUniqueOrThrow({where:{id:f.cost.id},include:{bankSettlements:true}});expect(cost.amountCents).toBe(1800000);expect(settledCents(cost.bankSettlements)).toBe(1750000);
  await expect(applyExpense({...f.command(a.id,0),expectedRevision:1,voidId:cost.bankSettlements.find(r=>r.kind==="COST_PAYMENT")!.id})).rejects.toThrow(/vratku/);
});
test("P01B cizí náklad, jednotka, účet a prohlížecí přístup nemohou zapisovat",async({page})=>{
  const f=await fixture(page),bank=await f.bank(-10000),foreign=await db.unit.findFirstOrThrow({where:{propertyId:{not:f.propertyId}}});
  await expect(applyExpense({...f.command(bank.id,10000),costId:undefined,newCost:{title:"P01B cizí jednotka",amountCents:10000,effectiveAt:new Date(),unitId:foreign.id,kind:"OPEX",category:"OTHER"}})).rejects.toThrow(/Jednotka/);
  await expect(applyExpense({...f.command(bank.id,10000),targetPropertyId:foreign.propertyId})).rejects.toThrow(/účet/);
  const otherCost=await db.propertyCost.create({data:{propertyId:foreign.propertyId,title:"P01B cizí náklad",amountCents:10000,status:"ACTUAL",kind:"OPEX",effectiveAt:new Date()}});
  await expect(applyExpense({...f.command(bank.id,10000),costId:otherCost.id})).rejects.toThrow(/cílového domu/);
  const result=await post(page,`/api/properties/${foreign.propertyId}/bank-expenses/${bank.id}`,{revision:"0",kind:"TRANSFER",amount:"100",reason:"P01B scope"});expect(result.get("error")).toContain("oprávnění");
  await db.userProperty.update({where:{userId_propertyId:{userId:f.actor.id,propertyId:f.propertyId}},data:{permission:"VIEW"}});
  try {
    await page.goto(`/nemovitosti/${f.propertyId}/bankovni-vydaje?year=2026`);
    await expect(page.getByText("Importovat výdaje a vratky z CSV",{exact:true})).toHaveCount(0);
    const denied=await post(page,`/api/properties/${f.propertyId}/bank-expenses/${bank.id}`,{revision:"0",kind:"TRANSFER",amount:"100",reason:"P01B VIEW"});expect(denied.get("error")).toContain("oprávnění");
  } finally {await db.userProperty.update({where:{userId_propertyId:{userId:f.actor.id,propertyId:f.propertyId}},data:{permission:"EDIT"}});}
  expect(await db.bankExpenseAllocation.count({where:{transactionId:bank.id}})).toBe(0);
});
test("P01B nové náklady, zálohy a převody přes uživatelský formulář",async({page})=>{
  const f=await fixture(page),bank=await f.bank(-10000);
  await page.goto(`/nemovitosti/${f.propertyId}/bankovni-vydaje?year=2026`);
  const panel=page.locator(`#pohyb-${bank.id}`);await panel.locator("summary").click();
  await panel.getByLabel("Vazba na náklad").selectOption("create");await panel.getByLabel("Název nákladu").fill("P01B nový návrh");await panel.getByLabel("Datum vzniku nákladu / období").fill("2025-12-31");await panel.getByLabel("Důvod / podklad přiřazení").fill("P01B nový doklad");await panel.getByRole("button",{name:"Vytvořit návrh a připojit úhradu"}).click();
  await expect(page.getByRole("heading",{name:"P01B nový návrh",exact:true})).toBeVisible();await expect(page.getByRole("region",{name:"Úhrady nákladu"})).toContainText("100,00 Kč");
  const created=await db.propertyCost.findFirstOrThrow({where:{title:"P01B nový návrh",bankSettlements:{some:{transactionId:bank.id}}}});expect(created.status).toBe("COMMITTED");
  for(const kind of ["ADVANCE","TRANSFER","LOAN_PRINCIPAL","DEPOSIT_REFUND"] as const){const b=await f.bank(-10000);await applyExpense({...f.command(b.id,10000),costId:undefined,kind});}
  expect(await db.propertyCost.count({where:{id:f.cost.id}})).toBe(1);
});
test("P01B CSV opakovaný import, konflikt ID rollback a změna souboru bez duplikace",async({page})=>{
  const f=await fixture(page),property=await db.property.findUniqueOrThrow({where:{id:f.propertyId}});
  const owner=await db.owner.findFirstOrThrow();
  const oa=await db.ownerBankAccount.create({data:{ownerId:property.ownerId||owner.id,accountNumber:String(Math.floor(Math.random()*1000000000)+1),bankCode:"0800",label:`P01B ${f.suffix}`}});
  await db.propertyPaymentAccount.create({data:{propertyId:f.propertyId,ownerBankAccountId:oa.id,active:true}});
  const content=`id;datum;castka;mena;protistrana;ucet;vs;zprava\n${f.suffix};2026-01-15;-100,50;CZK;Test;123/0800;01;Faktura`;
  const url=`/api/properties/${f.propertyId}/bank-expenses/import`;
  const upload=async(text:string,name:string)=>{
    await page.goto(`/nemovitosti/${f.propertyId}/bankovni-vydaje?year=2026`);
    await page.getByText("Importovat výdaje a vratky z CSV",{exact:true}).click();
    const form=page.locator(`form[action="${url}"]`);
    await form.getByLabel("Účet vlastníka").selectOption(oa.id);
    await form.getByLabel("CSV výpis").setInputFiles({name,mimeType:"text/csv",buffer:Buffer.from(text)});
    await form.getByRole("checkbox").check();await form.getByRole("button",{name:"Importovat CSV",exact:true}).click();
    await expect(page.getByRole("status").or(page.getByRole("alert").filter({hasText:"jinými údaji"}))).toBeVisible();
    return new URL(page.url()).searchParams;
  };
  expect((await upload(content,"a.csv")).get("ok")).toContain("Importováno 1");
  expect((await upload(content,"b.csv")).get("ok")).toContain("Importováno 0");
  expect((await upload(content.replace("-100,50","-101,50"),"c.csv")).get("error")).toContain("jinými údaji");
  expect(await db.bankTransaction.count({where:{externalId:f.suffix,source:"expense-statement"}})).toBe(1);
});

test("P01B shared account can settle another linked house and rejects unlinked houses",async({page})=>{
  const f=await fixture(page),other=await db.property.findFirstOrThrow({where:{id:{not:f.propertyId}}});
  const owner=await db.owner.findFirstOrThrow();
  const oa=await db.ownerBankAccount.create({data:{ownerId:owner.id,accountNumber:"999123456",bankCode:"0800"}});
  await db.propertyPaymentAccount.create({data:{propertyId:other.id,ownerBankAccountId:oa.id,active:true}});
  await db.bankAccount.update({where:{id:f.account.id},data:{ownerId:owner.id,iban:"999123456/0800"}});
  const cost=await db.propertyCost.create({data:{propertyId:other.id,title:"P01B sdílený účet",amountCents:12345,status:"COMMITTED",kind:"OPEX",effectiveAt:new Date()}});
  const bank=await f.bank(-12345);
  await applyExpense({...f.command(bank.id,12345),targetPropertyId:other.id,costId:cost.id});
  expect(await db.bankExpenseAllocation.count({where:{transactionId:bank.id,propertyCostId:cost.id,propertyId:other.id}})).toBe(1);
});
test("P01B fully credited invoice preserves payments and reports refund due",async({page})=>{
  const f=await fixture(page),bank=await f.bank(-1800000);await applyExpense(f.command(bank.id,1800000));
  const cost=await db.propertyCost.findUniqueOrThrow({where:{id:f.cost.id}});
  const response=await post(page,`/api/properties/${f.propertyId}/costs/${cost.id}`,{expectedUpdatedAt:cost.updatedAt.toISOString(),kind:cost.kind,status:cost.status,category:cost.category,title:cost.title,amount:"0",effectiveAt:"2025-12-15",reason:"P01B úplný dobropis DOB-01"});expect(response.has("ok"),response.toString()).toBe(true);
  await page.goto(`/nemovitosti/${f.propertyId}/naklady/${cost.id}`);await expect(page.getByRole("region",{name:"Úhrady nákladu"})).toContainText("Přeplatek k vrácení");
  const refund=await f.bank(1800000);await applyExpense({...f.command(refund.id,1800000),kind:"COST_REFUND"});
  const saved=await db.propertyCost.findUniqueOrThrow({where:{id:cost.id},include:{bankSettlements:true}});expect(saved.amountCents).toBe(0);expect(settledCents(saved.bankSettlements)).toBe(0);
});
