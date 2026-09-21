import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { crmToday } from "../lib/distribution/prospect-overview";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
const db = new PrismaClient();
const prefix = `P07A ${crypto.randomUUID().slice(0,8)}`;
let contactId: string, emptyId: string, unitA: string, unitB: string, houseA: string, houseB: string, oppA: string;
const today = crmToday();
const day = (offset: number) => { const value = new Date(`${today}T00:00:00Z`); value.setUTCDate(value.getUTCDate()+offset); return value; };
async function login(page: Page, email = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test", password = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026") {
  await page.goto("/login"); await page.getByLabel("E-mail").fill(email); await page.getByLabel("Heslo").fill(password); await page.getByRole("button",{name:"Přihlásit se",exact:true}).click(); await expect(page).toHaveURL(/\/portfolio/);
}
async function overview(page: Page, query = "") {
  await page.goto(`/distribuce/zajemci?q=${encodeURIComponent(prefix)}${query}`);
  await expect(page.getByRole("heading",{name:"Přehled zájemců",exact:true})).toBeVisible();
  return page.locator("#adresar");
}
test.beforeAll(async () => {
  if (process.env.E2E_BASE_URL || !["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("P07A fixtures require isolated local/CI database");
  const actor = await db.user.findUniqueOrThrow({where:{email:process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test"}});
  const owner = await db.owner.create({data:{name:prefix}});
  const a = await db.property.create({data:{ownerId:owner.id,name:`${prefix} dům A`,address:"Test 1",city:"Praha",flatcloudConsolidationBasisPoints:10000,units:{create:[{label:"A-101"},{label:"A-102"}] }},include:{units:true}});
  const b = await db.property.create({data:{ownerId:owner.id,name:`${prefix} dům B`,address:"Test 2",city:"Praha",flatcloudConsolidationBasisPoints:10000,units:{create:{label:"B-201"}}},include:{units:true}});
  houseA=a.id; houseB=b.id; unitA=a.units[0].id; unitB=b.units[0].id;
  const contact = await db.distributionProspect.create({data:{name:`${prefix} Žaneta`,email:"p07a@example.test",source:"P07A doporučení",note:"Kontakt pro dvě jednotky",createdById:actor.id}});contactId=contact.id;
  emptyId=(await db.distributionProspect.create({data:{name:`${prefix} Bez nabídky`,email:"p07a-empty@example.test",createdById:actor.id}})).id;
  oppA=(await db.distributionOpportunity.create({data:{prospectId:contactId,unitId:unitA,stage:"VIEWING",nextActionAt:day(0),note:"Domluvit prohlídku",createdById:actor.id}})).id;
  await db.distributionOpportunity.createMany({data:[{prospectId:contactId,unitId:unitB,stage:"OFFER",nextActionAt:day(-1),createdById:actor.id},{prospectId:contactId,unitId:a.units[1].id,stage:"WON",nextActionAt:day(-1),createdById:actor.id}]});
  // Existing contacts survive deactivation of a house without exposing that house's opportunities.
  const inactive = await db.property.create({data:{ownerId:owner.id,name:`${prefix} skrytý dům`,address:"Test 3",city:"Praha",active:false,flatcloudConsolidationBasisPoints:10000,units:{create:{label:"HIDDEN"}}},include:{units:true}});
  await db.distributionOpportunity.create({data:{prospectId:emptyId,unitId:inactive.units[0].id,stage:"NEW",createdById:actor.id}});
});
test.afterAll(async()=>{await db.$disconnect();});

test("P07A jeden kontakt ukazuje více jednotek, fáze, termín i detail s historií", async({page})=>{
  await login(page);await page.locator(".sidebar").getByRole("link",{name:"Zájemci",exact:true}).click();
  await expect(page.locator(".sidebar").getByRole("link",{name:"Zájemci",exact:true})).toHaveAttribute("aria-current","page");
  await expect(page.locator(".sidebar").getByRole("link",{name:"Distribuce",exact:true})).not.toHaveAttribute("aria-current","page");
  const directory=await overview(page),row=directory.locator(`[data-prospect-id="${contactId}"]`);
  await expect(directory.locator("tbody tr")).toHaveCount(2);await expect(row.locator("li")).toHaveCount(3);
  await expect(row).toContainText("A-101");await expect(row).toContainText("B-201");await expect(row).toContainText("Prohlídka");await expect(row).toContainText("Nabídka");await expect(row).toContainText("Dnes");await expect(row).toContainText("Domluvit prohlídku");
  await row.locator(`[data-opportunity-id="${oppA}"]`).getByRole("link",{name:"Detail a úprava příležitosti"}).click();await expect(page).toHaveURL(new RegExp(`#prilezitost-${oppA}$`));
  await page.locator(`#prilezitost-${oppA}`).getByText("Upravit",{exact:true}).click();
  const dialog=page.getByRole("dialog",{name:`Upravit příležitost ${prefix} Žaneta`,exact:true});
  await dialog.getByLabel("Fáze *").selectOption("CONTACTED");await dialog.getByLabel("Poznámka",{exact:true}).fill("Potvrdit čas prohlídky");await dialog.getByRole("button",{name:"Uložit fázi a další krok včetně opce"}).click();
  await expect(page.getByText("Fáze, opce a další krok byly aktualizovány.")).toBeVisible();
  await expect(page.locator(`#adresar [data-opportunity-id="${oppA}"]`)).toContainText("Kontaktován");await expect(page.locator(`#adresar [data-opportunity-id="${oppA}"]`)).toContainText("Potvrdit čas prohlídky");
  expect(await db.distributionOpportunityEvent.count({where:{opportunityId:oppA}})).toBeGreaterThan(0);
});
test("P07A filtry se kombinují na téže příležitosti a dnešní termín není po splatnosti", async({page})=>{
  await login(page);const directory=await overview(page);const filters=page.getByRole("form",{name:"Filtry zájemců"});
  await filters.getByLabel("Dům",{exact:true}).selectOption(houseA);await filters.getByLabel("Fáze příležitosti").selectOption("OFFER");await filters.getByRole("button",{name:"Použít filtry"}).click();await expect(directory).toContainText("Žádné kontakty neodpovídají výběru");
  await overview(page,`&propertyId=${houseB}&stage=OFFER`);await expect(directory.locator("li")).toHaveCount(1);await expect(directory.locator("li")).toContainText("B-201");
  await overview(page,"&due=overdue");await expect(directory.locator("li")).toHaveCount(1);await expect(directory.locator("li")).toContainText("B-201");
  await overview(page,"&due=today");await expect(directory.locator("li")).toHaveCount(1);await expect(directory.locator("li")).toContainText("A-101");await expect(directory.locator("li")).not.toContainText("Po termínu");
  await overview(page,`&unitId=${unitB}`);await expect(directory.locator("li")).toHaveCount(1);await page.reload();await expect(filters.getByLabel("Jednotka",{exact:true})).toHaveValue(unitB);
  await filters.getByRole("link",{name:"Zrušit filtry"}).click();await expect(filters.getByLabel("Jednotka",{exact:true})).toHaveValue("");
});
test("P07A kontakt bez nabídky lze upravit a přidat jeho první viditelnou příležitost", async({page})=>{
  await login(page);const directory=await overview(page,"&unassigned=1");await expect(directory.locator("tbody tr")).toHaveCount(1);await expect(directory).not.toContainText("HIDDEN");
  const row=directory.locator(`[data-prospect-id="${emptyId}"]`);await row.getByText("Upravit kontakt",{exact:true}).click();
  const dialog=page.getByRole("dialog",{name:`Upravit kontakt: ${prefix} Bez nabídky`,exact:true});await dialog.getByLabel("Telefon",{exact:true}).fill("+420 700 000 007");await dialog.getByRole("button",{name:"Uložit kontakt"}).click();await expect(page.getByText("Kontakt byl uložen.")).toBeVisible();
  await page.locator(`#adresar [data-prospect-id="${emptyId}"]`).getByRole("link",{name:"Přidat příležitost"}).click();
  const create=page.locator("#nova-prilezitost");await expect(create.getByLabel("Zájemce *")).toHaveValue(emptyId);await create.getByLabel("Jednotka *").selectOption(unitA);await create.getByRole("button",{name:"Založit příležitost"}).click();
  await expect(page.getByText("Příležitost byla založena.")).toBeVisible();await expect(page.locator(`#adresar [data-prospect-id="${emptyId}"]`)).toContainText("A-101");
  expect((await db.distributionProspect.findUniqueOrThrow({where:{id:emptyId}})).phone).toBe("+420 700 000 007");
});
test("P07A nový kontakt, mobilní přehled a zachované omezení interního CRM", async({page})=>{
  await login(page);await overview(page);await page.getByRole("link",{name:"Nový kontakt",exact:true}).click();await expect(page.locator("#novy-zajemce")).toHaveAttribute("open","");
  await page.getByLabel("Jméno / název *").fill(`${prefix} Nový`);await page.locator("#novy-zajemce").getByLabel("E-mail",{exact:true}).fill("p07a-new@example.test");await page.getByRole("button",{name:"Přidat zájemce",exact:true}).click();await expect(page.getByText("Zájemce byl přidán do interního CRM.")).toBeVisible();
  await overview(page);await page.setViewportSize({width:390,height:844});await expect(page.getByRole("button",{name:"Použít filtry"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath("p07a-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:test.info().outputPath("p07a-desktop.png"),fullPage:true});
  await page.context().clearCookies();await login(page,R24_ROLE_USERS.advanced,process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD);await page.goto("/distribuce/zajemci");await expect(page).toHaveURL(/\/portfolio/);await expect(page.locator(".sidebar").getByRole("link",{name:"Zájemci",exact:true})).toHaveCount(0);
});
