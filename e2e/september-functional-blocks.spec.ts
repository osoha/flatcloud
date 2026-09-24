import { expect,test,type Page } from "@playwright/test";
import { prisma } from "../lib/db";
import { runExpenseRules } from "../lib/bank-expense-rules";
import { expenseImportPreview } from "../lib/bank-expense-import-preview";
import { parseExpenseStatement } from "../lib/bank-expense-values";
import { userPropertyOverview } from "../lib/user-property-overview";
import { R24_ROLE_USERS,R24_ROLE_PASSWORD } from "../prisma/seed-r24-agent-roles";

test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("Isolated database required");});
async function login(page:Page,email=process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test",password=process.env.E2E_ADMIN_PASSWORD||"FlatCloud-E2E-Only-Password-2026"){
 await page.goto("/login");await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Heslo",{exact:true}).fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);
}
async function fixture(){
 const actor=await prisma.user.findUniqueOrThrow({where:{email:process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test"}});
 const tag=crypto.randomUUID();const owner=await prisma.owner.create({data:{name:`Rules ${tag}`}});
 const property=await prisma.property.create({data:{name:`Rules ${tag}`,address:"Test 1",city:"Praha",ownerId:owner.id,units:{create:{label:"A"}}}});
 const account=await prisma.bankAccount.create({data:{propertyId:property.id,ownerId:owner.id,provider:"expense-statement",externalAccountId:`${Date.now()}/0800`,bankName:"Test",iban:"19-2000145399/0800",ibanMasked:"Test"}});
 const bank=()=>prisma.bankTransaction.create({data:{bankAccountId:account.id,externalId:crypto.randomUUID(),bookedAt:new Date("2026-09-01T12:00:00Z"),amountCents:-10000,currency:"CZK",counterpartyName:"Dodavatel",counterpartyIban:"123/0800",variableSymbol:"DOC1",source:"expense-statement"}});
 const rule={name:"Servis",bankAccountId:account.id,sourcePropertyId:property.id,targetPropertyId:property.id,createdById:actor.id,action:"CREATE_COST",conditions:{direction:"OUT",counterpartyAccount:"123/0800"}};
 return {actor,owner,property,account,bank,rule};
}
async function post(page:Page,url:string,body:unknown){return page.evaluate(async({url,body})=>{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{url,body});}

test("výdajová pravidla: souběh vytvoří jediný návrh, kolize nic nezaúčtuje, ignorování zachová pohyb",async()=>{
 const f=await fixture();const rule=await prisma.bankExpenseRule.create({data:f.rule});const bank=await f.bank();
 await Promise.all([runExpenseRules(f.property.id,[bank.id]),runExpenseRules(f.property.id,[bank.id])]);
 expect(await prisma.bankExpenseAllocation.count({where:{transactionId:bank.id}})).toBe(1);
 expect(await prisma.propertyCost.count({where:{propertyId:f.property.id,status:"COMMITTED"}})).toBe(1);
 expect((await prisma.bankExpenseRule.findUniqueOrThrow({where:{id:rule.id}})).usedCount).toBe(1);
 const overlap=await prisma.bankExpenseRule.create({data:{...f.rule,action:"IGNORE",name:"Kolize"}}),second=await f.bank();
 expect((await runExpenseRules(f.property.id,[second.id])).applied).toBe(0);
 await prisma.bankExpenseRule.update({where:{id:rule.id},data:{active:false}});
 await runExpenseRules(f.property.id,[second.id]);
 expect((await prisma.bankTransaction.findUniqueOrThrow({where:{id:second.id}})).expenseIgnoredAt).not.toBeNull();
 expect(await prisma.bankExpenseAllocation.count({where:{transactionId:second.id}})).toBe(0);
 expect((await prisma.bankExpenseRule.findUniqueOrThrow({where:{id:overlap.id}})).usedCount).toBe(1);
});

test("pravidla: existující faktura, cizí účet a odebrané oprávnění",async()=>{
 const f=await fixture();const cost=await prisma.propertyCost.create({data:{propertyId:f.property.id,title:"DOC1",documentNumber:"DOC1",amountCents:10000,status:"COMMITTED",kind:"OPEX",effectiveAt:new Date()}});
 const rule=await prisma.bankExpenseRule.create({data:{...f.rule,action:"MATCH"}}),bank=await f.bank();await runExpenseRules(f.property.id,[bank.id]);
 expect(await prisma.bankExpenseAllocation.count({where:{transactionId:bank.id,propertyCostId:cost.id}})).toBe(1);
 const other=await fixture();await prisma.bankExpenseRule.update({where:{id:rule.id},data:{targetPropertyId:other.property.id,action:"CREATE_COST"}});
 const second=await f.bank();expect((await runExpenseRules(f.property.id,[second.id])).applied).toBe(0);
 const unauthorized=await prisma.user.create({data:{name:"Bez oprávnění",email:`rules-${crypto.randomUUID()}@example.invalid`,passwordHash:"no-login"}});
 await prisma.bankExpenseRule.update({where:{id:rule.id},data:{targetPropertyId:f.property.id,createdById:unauthorized.id}});
 expect((await runExpenseRules(f.property.id,[second.id])).applied).toBe(0);
 expect(await prisma.bankExpenseAllocation.count({where:{transactionId:second.id}})).toBe(0);
});

test("import: nový identifikátor stejné platby je podezřelý i napříč zdroji",async()=>{
 const f=await fixture();await prisma.bankAccount.update({where:{id:f.account.id},data:{provider:"another-feed"}});await f.bank();
 const records=parseExpenseStatement("id;datum;castka;mena;protistrana;ucet;vs;zprava\nEXCEL1;2026-09-01;-100;CZK;Dodavatel;123/0800;DOC1;Servis");
 const before=await prisma.bankTransaction.count();const preview=await expenseImportPreview(prisma,records,"19-2000145399/0800",f.owner.id);
 expect(preview.rows[0].state).toBe("suspect");expect(await prisma.bankTransaction.count()).toBe(before);
 const changed=await expenseImportPreview(prisma,records.map(r=>({...r,amountCents:-20000})),"19-2000145399/0800",f.owner.id);expect(changed.token).not.toBe(preview.token);expect(changed.rows[0].state).toBe("new");
});

test("pravidla: náhled, vytvoření a zpětné použití přes UI",async({page},testInfo)=>{
 const f=await fixture();await f.bank();await login(page);await page.goto(`/nemovitosti/${f.property.id}/bankovni-vydaje/pravidla`);
 await page.getByLabel("Název pravidla / nového nákladu").fill("Ignorovat testovací poplatek");await page.getByLabel("Účet protistrany – přesná shoda").fill("123/0800");await page.getByLabel("Účinek pravidla").selectOption("IGNORE");await page.getByRole("button",{name:"Zobrazit náhled pravidla"}).click();await expect(page.getByRole("heading",{name:"Náhled: 1 odpovídajících pohybů"})).toBeVisible();
 await page.getByRole("button",{name:"Uložit pravidlo pro budoucí importy"}).click();await expect(page.getByRole("heading",{name:"Ignorovat testovací poplatek · Zapnuto"})).toBeVisible();
 await page.getByRole("button",{name:"Náhled zpětného použití"}).click();await expect(page.getByRole("button",{name:"Potvrdit použití na zobrazené pohyby"})).toBeVisible();await page.getByRole("button",{name:"Potvrdit použití na zobrazené pohyby"}).click();await expect(page.getByRole("status")).toContainText("Použito: 1");
 await page.screenshot({path:testInfo.outputPath("expense-rules.png"),fullPage:true});
 await page.goto(`/nemovitosti/${f.property.id}/bankovni-vydaje?year=2026&state=ignored`);await page.locator('details[id^="pohyb-"] summary').click();await page.getByLabel("Důvod",{exact:true}).fill("Vrácení do evidence");await page.getByRole("button",{name:"Vrátit do fronty"}).click();await expect(page.getByRole("status")).toContainText("Stav pohybu uložen");
});

test("uživatelé: vazby se nezaměňují a našeptávač vybere existující účet",async({page},testInfo)=>{
 const f=await fixture(),person=await prisma.user.create({data:{name:"Výběr Spolupracovníka",email:`picker-${crypto.randomUUID()}@example.invalid`,passwordHash:"no-login"}});
 await prisma.property.update({where:{id:f.property.id},data:{managerId:person.id}});await prisma.auditLog.create({data:{userId:person.id,entityId:f.property.id,entityType:"Property",action:"PROPERTY_CREATED"}});
 const view=(await userPropertyOverview())(person.id).find(p=>p.id===f.property.id)!;expect(view.roles).toEqual(["Založil","Spravuje"]);expect(view.accessibleUnits).toBe(0);
 await login(page);await page.goto(`/nemovitosti/${f.property.id}/nastaveni/uzivatele`);await page.locator('.collaborator-picker input[name="name"]').fill("Výběr Spolupracovníka");await page.getByRole("option").getByRole("button").click();await expect(page.locator('.collaborator-picker input[name="email"]')).toHaveValue(person.email);await page.getByRole("button",{name:"Přidat člena",exact:true}).click();
 expect(await prisma.userProperty.count({where:{userId:person.id,propertyId:f.property.id}})).toBe(1);expect(await prisma.userInvitation.count({where:{email:person.email}})).toBe(0);
 await page.goto(`/uzivatele/${person.id}#nemovitosti`);await expect(page.locator("#nemovitosti")).toContainText("Založil · Spravuje · Přístup k domu");await page.screenshot({path:testInfo.outputPath("user-relations.png"),fullPage:true});
});

test("našeptávač správce neprozradí cizí účty",async({page})=>{
 const actor=await prisma.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.advanced},include:{memberships:true}}),propertyId=actor.memberships[0].propertyId;
 const member=await prisma.userProperty.findUniqueOrThrow({where:{userId_propertyId:{userId:actor.id,propertyId}}});await prisma.userProperty.update({where:{userId_propertyId:{userId:actor.id,propertyId}},data:{permission:"ADMIN"}});
 const stranger=await prisma.user.create({data:{name:`Neznámý ${crypto.randomUUID()}`,email:`unknown-${crypto.randomUUID()}@example.invalid`,passwordHash:"no-login"}});
 try{await login(page,actor.email,process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD);const result=await page.evaluate(async({propertyId,q})=>(await fetch(`/api/properties/${propertyId}/collaborator-search?q=${encodeURIComponent(q)}`)).json(),{propertyId,q:stranger.name});expect(result.users).toEqual([]);}finally{await prisma.userProperty.update({where:{userId_propertyId:{userId:actor.id,propertyId}},data:{permission:member.permission}});}
});

test("oznámení: editace zachová skrytí, opětovné upozornění je výslovné; šablona nemění úkoly",async({page})=>{
 const f=await fixture();const item=await prisma.announcement.create({data:{title:"Původní text",body:"Původní sdělení",createdById:f.actor.id,audiences:{create:{kind:"ALL_USERS"}},userStates:{create:{userId:f.actor.id,readAt:new Date(),dismissedAt:new Date()}}}});
 await login(page);await page.goto("/nastaveni/oznameni");const card=page.locator(`[id="${item.id}"]`);await card.getByText("Upravit text oznámení",{exact:true}).click();await card.getByLabel("Název",{exact:true}).fill("Upravený text");await card.getByRole("button",{name:"Uložit text oznámení"}).click();
 expect((await prisma.announcementUserState.findUniqueOrThrow({where:{announcementId_userId:{announcementId:item.id,userId:f.actor.id}}})).dismissedAt).not.toBeNull();
 await card.getByText("Upravit text oznámení",{exact:true}).click();await card.getByRole("checkbox").check();await card.getByRole("button",{name:"Uložit text oznámení"}).click();expect((await prisma.announcementUserState.findUniqueOrThrow({where:{announcementId_userId:{announcementId:item.id,userId:f.actor.id}}})).dismissedAt).toBeNull();expect(await prisma.auditLog.count({where:{entityId:item.id,action:"ANNOUNCEMENT_EDITED"}})).toBe(2);
 await page.goto("/nastaveni/automaticke-ukoly");const rule=page.locator("#auto_lease_expiry");const old=await prisma.taskAutomationRule.findUniqueOrThrow({where:{id:"auto_lease_expiry"}});const tasks=await prisma.task.findMany({where:{automationRuleId:old.id},select:{id:true,description:true}});
 try{await rule.locator('[name="templateBody"]').fill("Nová šablona pouze pro nové úkoly.");await rule.getByRole("button",{name:"Uložit pravidlo"}).click();expect((await prisma.taskAutomationRule.findUniqueOrThrow({where:{id:old.id}})).templateBody).toBe("Nová šablona pouze pro nové úkoly.");expect(await prisma.task.findMany({where:{automationRuleId:old.id},select:{id:true,description:true}})).toEqual(tasks);}finally{await prisma.taskAutomationRule.update({where:{id:old.id},data:{templateBody:old.templateBody}});}
});
