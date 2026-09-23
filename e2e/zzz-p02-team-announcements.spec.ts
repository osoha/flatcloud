import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../lib/db";
import { runTaskAutomation } from "../lib/task-automation";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const marker="P02_TEAM_2026_09";
test.beforeAll(()=>{if(!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("P02 fixtures require isolated local/CI DB");});
test.afterAll(async()=>{await db.$disconnect()});

async function login(page:Page,email:string){await page.goto("/login");await page.getByLabel("E-mail").fill(email);await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD||R24_ROLE_PASSWORD);await page.getByRole("button",{name:"Přihlásit se"}).click();await expect(page).toHaveURL(/\/portfolio(?:\?|$)/)}

test("P02 general thread isolates participants and preserves collaborator/watcher roles",async({browser})=>{
  const [creator,collaborator,watcher,outsider]=await Promise.all([
    db.user.findFirstOrThrow({where:{role:"SUPER_ADMIN",active:true}}),
    db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.internalAssistant}}),
    db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.novice}}),
    db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.externalOwner}}),
  ]);
  const task=await db.task.create({data:{title:`${marker} ${randomUUID()}`,description:"Společné testovací vlákno",category:"GENERAL",createdById:creator.id,members:{create:[{userId:collaborator.id,role:"COLLABORATOR"},{userId:watcher.id,role:"WATCHER"}]},entries:{create:{authorId:creator.id,kind:"COMMENT",body:`${marker} first`,visibility:"INTERNAL"}}}});
  const collaboratorPage=await browser.newPage();await login(collaboratorPage,collaborator.email);await collaboratorPage.goto(`/ukoly/${task.id}`);await expect(collaboratorPage.getByText(`${marker} first`,{exact:true})).toBeVisible();await expect(collaboratorPage.getByRole("button",{name:"Přidat do vlákna"})).toBeVisible();
  await collaboratorPage.getByLabel("Nový záznam").fill(`${marker} collaborator`);await collaboratorPage.getByRole("button",{name:"Přidat do vlákna"}).click();await expect(collaboratorPage.getByText(`${marker} collaborator`,{exact:true})).toBeVisible();
  const watcherPage=await browser.newPage();await login(watcherPage,watcher.email);await watcherPage.goto(`/ukoly/${task.id}`);await expect(watcherPage.getByText(`${marker} collaborator`,{exact:true})).toBeVisible();await expect(watcherPage.getByRole("button",{name:"Přidat do vlákna"})).toHaveCount(0);
  const outsiderPage=await browser.newPage();await login(outsiderPage,outsider.email);const denied=await outsiderPage.goto(`/ukoly/${task.id}`);expect(denied?.status()).toBe(404);
});

test("P02 general task expands explicit audience groups and lists FlatCloud team first",async({page})=>{
  const creator=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.distributionLead}});
  const title=`${marker} audience ${randomUUID()}`;
  await login(page,creator.email);await page.goto("/ukoly/novy");
  const collaborators=page.getByLabel("Spoluřešitelé");
  await expect(collaborators.locator("optgroup").first()).toHaveAttribute("label","Tým FlatCloud");
  await expect(collaborators.locator('optgroup[label="Ostatní uživatelé"]')).toHaveCount(1);
  await page.getByLabel("Název *").fill(title);
  await page.getByLabel("Všichni členové týmu FlatCloud").check();
  await page.getByRole("button",{name:"Vytvořit úkol"}).click();
  await expect(page.getByText("Úkol byl vytvořen.")).toBeVisible();
  const task=await db.task.findFirstOrThrow({where:{title},include:{members:true}});
  const expected=await db.user.findMany({where:{active:true,id:{not:creator.id},OR:[{flatcloudMember:true},{role:"SUPER_ADMIN"}]},select:{id:true}});
  expect(new Set(task.members.map(member=>member.userId))).toEqual(new Set(expected.map(person=>person.id)));
  expect(task.members.every(member=>member.role==="WATCHER")).toBe(true);
});

test("P02 favorite and dashboard dismissal are personal and reversible",async({page})=>{
  const actor=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.internalAssistant}}),creator=await db.user.findFirstOrThrow({where:{role:"SUPER_ADMIN",active:true}});
  const task=await db.task.create({data:{title:`${marker} personal ${randomUUID()}`,category:"GENERAL",createdById:creator.id,members:{create:{userId:actor.id,role:"COLLABORATOR"}}}});
  await login(page,actor.email);await page.goto(`/ukoly/${task.id}`);
  await page.getByRole("button",{name:"☆ Přidat do oblíbených"}).click();expect((await db.taskUserState.findUniqueOrThrow({where:{taskId_userId:{taskId:task.id,userId:actor.id}}})).favorite).toBe(true);
  await page.getByRole("button",{name:"Už nezobrazovat na hlavní stránce"}).click();expect((await db.taskUserState.findUniqueOrThrow({where:{taskId_userId:{taskId:task.id,userId:actor.id}}})).dismissedAt).not.toBeNull();
  await page.goto("/ukoly?view=hidden");await expect(page.getByText(task.title,{exact:true})).toBeVisible();await page.getByRole("button",{name:"Vrátit do přehledu"}).click();expect((await db.taskUserState.findUniqueOrThrow({where:{taskId_userId:{taskId:task.id,userId:actor.id}}})).dismissedAt).toBeNull();
});

test("P02 targeted announcement appears only to its property audience and can be hidden",async({browser})=>{
  const creator=await db.user.findFirstOrThrow({where:{role:"SUPER_ADMIN",active:true}}),target=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.technicalManager}}),outsider=await db.user.findUniqueOrThrow({where:{email:R24_ROLE_USERS.novice}}),membership=await db.userProperty.findFirstOrThrow({where:{userId:target.id}});
  const announcement=await db.announcement.create({data:{title:`${marker} notice ${randomUUID()}`,body:"Plánovaná provozní odstávka",severity:"IMPORTANT",createdById:creator.id,audiences:{create:{kind:"PROPERTY",propertyId:membership.propertyId}}}});
  const targetPage=await browser.newPage();await login(targetPage,target.email);await targetPage.goto("/portfolio");await expect(targetPage.getByText(announcement.title,{exact:true})).toBeVisible();await targetPage.locator("article",{hasText:announcement.title}).getByRole("button",{name:"Už nezobrazovat"}).click();expect((await db.announcementUserState.findUniqueOrThrow({where:{announcementId_userId:{announcementId:announcement.id,userId:target.id}}})).dismissedAt).not.toBeNull();
  const outsiderPage=await browser.newPage();await login(outsiderPage,outsider.email);await outsiderPage.goto("/portfolio");await expect(outsiderPage.getByText(announcement.title,{exact:true})).toHaveCount(0);
});

test("P02 lease automation respects local override and is idempotent",async()=>{
  const rollback=new Error("rollback P02 automation fixture");
  await expect(db.$transaction(async tx=>{
    const lease=await tx.lease.findFirstOrThrow({where:{cancelledAt:null,unit:{property:{active:true}}},include:{unit:true}}),rule=await tx.taskAutomationRule.findUniqueOrThrow({where:{code:"LEASE_EXPIRY"}});
    const eventDate=new Date();eventDate.setUTCDate(eventDate.getUTCDate()+30);
    await tx.lease.update({where:{id:lease.id},data:{endDate:eventDate,terminatedOn:null,status:"ACTIVE"}});
    await tx.taskAutomationPropertySetting.upsert({where:{ruleId_propertyId:{ruleId:rule.id,propertyId:lease.unit.propertyId}},create:{ruleId:rule.id,propertyId:lease.unit.propertyId,mode:"DISABLED"},update:{mode:"DISABLED"}});
    expect((await runTaskAutomation(new Date(),tx)).created).toBe(0);
    await tx.taskAutomationPropertySetting.update({where:{ruleId_propertyId:{ruleId:rule.id,propertyId:lease.unit.propertyId}},data:{mode:"ENABLED"}});
    expect((await runTaskAutomation(new Date(),tx)).created).toBe(1);expect((await runTaskAutomation(new Date(),tx)).existing).toBeGreaterThanOrEqual(1);
    expect(await tx.task.count({where:{automationRuleId:rule.id,leaseId:lease.id}})).toBe(1);throw rollback;
  })).rejects.toBe(rollback);
});
