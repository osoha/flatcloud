import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Requires isolated CI database");
});
test.afterAll(async () => db.$disconnect());
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function fixture() {
  const actor = await db.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test" } });
  const name = `R24_AGENT_QA_2026_09 lease-create ${randomUUID()}`;
  const owner = await db.owner.create({ data: { name: `${name} owner` } });
  const property = await db.property.create({ data: { name, address: "TEST", city: "TEST", ownerId: owner.id } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: "1", ownerships: { create: { ownerId: owner.id } } } });
  const first = await db.tenant.create({ data: { createdById: actor.id, name: `${name} first`, payerAccounts: ["CZ6508000000192000145399"], propertyLinks: { create: { propertyId: property.id } } } });
  const second = await db.tenant.create({ data: { createdById: actor.id, name: `${name} second`, payerAccounts: ["123456789/5500"], propertyLinks: { create: { propertyId: property.id } } } });
  const company = await db.tenant.create({ data: { createdById: actor.id, name: `${name} company`, type: "COMPANY", propertyLinks: { create: { propertyId: property.id } } } });
  return { owner, property, unit, first, second, company, actor };
}

test("lease creation: owner account refresh retains entered values and current owner", async ({ page }) => {
  const f = await fixture();
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova?unitId=${f.unit.id}`);
  await expect(page.locator(".missing-owner-account[role=alert]")).toContainText(f.owner.name);
  await expect(page.getByRole("link", { name: "Nastavit příjemce plateb jednotky v nové kartě →" })).toHaveAttribute("href", `/bankovni-ucty?unitId=${f.unit.id}`);
  await page.locator('input[name="rent"]').fill("12345");
  await page.locator('input[name="note"], textarea[name="note"]').fill("Rozpracovaná smlouva");
  const accountPage = await page.context().newPage();
  await accountPage.goto(`/vlastnici/${f.owner.id}#bankovni-ucty`);
  const accountForm = accountPage.locator(`form[action="/api/owners/${f.owner.id}/bank-accounts"]`);
  await accountForm.locator('input[name="label"]').fill("Synthetic new owner account");
  await accountForm.locator('input[name="accountNumber"]').fill("2000145399");
  await accountForm.locator('input[name="bankCode"]').fill("0800");
  await accountForm.getByRole("button", { name: "Přidat bankovní účet" }).click();
  await expect(accountPage).toHaveURL(/\?ok=/);
  const account = await db.ownerBankAccount.findFirstOrThrow({ where: { ownerId: f.owner.id } });
  // Creating an account alone must not silently change the unit's payment recipient.
  await page.getByRole("button", { name: "Znovu načíst účet vlastníka" }).click();
  await expect(page.locator(".missing-owner-account[role=alert]")).toBeVisible();
  await db.ownerBankAccount.update({where:{id:account.id},data:{notificationVerifiedAt:new Date()}});
  await accountPage.goto(`/bankovni-ucty?unitId=${f.unit.id}`);
  const bankForm=accountPage.locator("#zmena-uctu form");
  await bankForm.getByLabel("Nový účet pro nájemné").selectOption(account.id);
  await bankForm.getByRole("button",{name:"Pokračovat",exact:true}).click();
  await bankForm.getByLabel("Důvod a smluvní podklad oznámení").fill("Doplnění příjemce QA");
  await bankForm.getByRole("button",{name:"Zobrazit dopad změny"}).click();
  await bankForm.getByRole("checkbox").nth(0).check();await bankForm.getByRole("checkbox").nth(1).check();
  await bankForm.getByRole("button",{name:"Potvrdit změnu a oznámení"}).click();
  await expect(accountPage).toHaveURL(/bankovni-ucty\/zmeny/);
  await accountPage.close();
  await page.getByRole("button", { name: "Znovu načíst účet vlastníka" }).click();
  await expect(page.locator('input[name="ownerBankAccountId"]')).toHaveValue(account.id);
  await expect(page.locator('input[name="rent"]')).toHaveValue("12345");
  await expect(page.locator('textarea[name="note"]')).toHaveValue("Rozpracovaná smlouva");
  const newAccount = await db.ownerBankAccount.create({ data: { ownerId: f.owner.id, label: "Synthetic second owner account", accountNumber: "123", bankCode: "0100" } });
  await page.goto(`/bankovni-ucty?unitId=${f.unit.id}`);
  const recipient = page.locator("#zmena-uctu");
  await expect(recipient.locator(`select option[value="${account.id}"]`)).toHaveCount(1);
  await expect(recipient.locator(`select option[value="${newAccount.id}"]`)).toHaveCount(1);
  await expect(recipient.getByLabel("Nový účet pro nájemné")).toHaveValue("");

});

test("tenant identity and author survive creation and editing; shared profiles require explicit selection", async ({ page }) => {
  const f = await fixture();
  const legacy = await db.tenant.create({ data: { name: `Legacy ${randomUUID()}`, propertyLinks: { create: { propertyId: f.property.id } } } });
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/najemnici/novy`);
  const name = `Synthetic identity ${randomUUID()}`;
  await page.getByLabel("Jméno a příjmení", { exact: false }).fill(name);
  await page.getByLabel("Datum narození", { exact: true }).fill("1986-05-23");
  await page.getByLabel("Číslo občanského / identifikačního dokladu").fill("QA-ID-ONLY");
  await page.getByLabel("Číslo cestovního pasu").fill("QA-PASSPORT-ONLY");
  await page.getByRole("button", { name: "Vytvořit profil", exact: true }).click();
  await expect(page).toHaveURL(/\/najemnici\/.+\?ok=/);
  const tenant = await db.tenant.findFirstOrThrow({ where: { name } });
  expect(tenant.createdById).toBe(f.actor.id);
  expect(tenant.dateOfBirth?.toISOString().slice(0, 10)).toBe("1986-05-23");
  expect(tenant.identityDocumentNumber).toBe("QA-ID-ONLY");
  await page.getByRole("link", { name: "Upravit profil", exact: true }).click();
  await expect(page.getByLabel("Datum narození", { exact: true })).toHaveValue("1986-05-23");
  await page.getByLabel("Číslo cestovního pasu").fill("QA-PASSPORT-UPDATED");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  expect((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).passportNumber).toBe("QA-PASSPORT-UPDATED");
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova`);
  await expect(page.locator(`select[name="tenantId"] option[value="${tenant.id}"]`)).toHaveCount(1);
  await expect(page.locator(`select[name="tenantId"] option[value="${legacy.id}"]`)).toHaveCount(0);
  await page.getByLabel("Výběr nájemníků").selectOption("AVAILABLE");
  await page.getByLabel("Hledat nájemníka", { exact: true }).fill(legacy.name);
  await expect(page.locator(`select[name="tenantId"] option[value="${legacy.id}"]`)).toHaveCount(1);
});

test("itemized services and residents create one correct recurring charge and preserve the saved breakdown", async ({ page }) => {
  const f = await fixture();
  const account = await db.ownerBankAccount.create({ data: { ownerId: f.owner.id, accountNumber: "2000145399", bankCode: "0800" } });
  await db.unitOwnership.updateMany({ where: { unitId: f.unit.id }, data: { ownerBankAccountId: account.id } });
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova?unitId=${f.unit.id}`);
  await page.locator('select[name="tenantId"]').selectOption(f.first.id);
  await page.locator('input[name="variableSymbol"]').fill("1234567890");
  await page.locator('input[name="rent"]').fill("10000");
  await page.getByLabel("Zadání záloh").selectOption("ITEMIZED");
  await page.locator('input[name="serviceName:0"]').fill("Studená voda");
  await page.locator('select[name="serviceCategory:0"]').selectOption("WATER");
  await page.locator('input[name="serviceAmount:0"]').fill("700.25");
  await page.getByRole("button", { name: "Přidat službu", exact: true }).click();
  await page.locator('input[name="serviceName:1"]').fill("Teplo");
  await page.locator('select[name="serviceCategory:1"]').selectOption("HEATING");
  await page.locator('input[name="serviceAmount:1"]').fill("1800.25");
  await page.getByRole("button", { name: "Přidat obyvatele", exact: true }).click();
  await expect(page.locator(`select[name="occupantProfile:0"] option[value="${f.company.id}"]`)).toHaveCount(0);
  await page.locator('select[name="occupantProfile:0"]').selectOption(f.second.id);
  await page.getByRole("button", { name: "Přidat obyvatele", exact: true }).click();
  await page.locator('input[name="occupantName:1"]').fill("Nový obyvatel QA");
  await page.getByRole("button", { name: "Vytvořit smlouvu", exact: true }).click();
  await expect(page).toHaveURL(/\/predpisy\/.+\?ok=/);
  const lease = await db.lease.findFirstOrThrow({ where: { unitId: f.unit.id }, include: { paymentItems: true, charges: { include: { items: true } }, occupants: true } });
  expect(lease.servicesCents).toBe(250050);
  expect(lease.paymentItems.filter(item => item.category === "SERVICES")).toHaveLength(0);
  expect(lease.paymentItems.find(item => item.category === "WATER")?.amountCents).toBe(70025);
  expect(lease.occupants.map(person => person.name).sort()).toEqual([f.second.name, "Nový obyvatel QA"].sort());
  expect(lease.charges.length).toBeGreaterThan(0);
  for (const charge of lease.charges) {
    expect(charge.amountCents).toBe(1250050);
    expect(charge.items.map(item => item.category).sort()).toEqual(["HEATING", "RENT", "WATER"]);
  }
});

test("reload recovers primary tenant, parties, service rows and resident rows without stale account state", async ({ page }) => {
  const f = await fixture();
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova`);
  await page.locator('select[name="tenantId"]').selectOption(f.first.id);
  await page.getByLabel("Přidat osobu do smlouvy").selectOption(f.second.id);
  await page.locator(`input[name="contractingPartyIds"][value="${f.second.id}"]`).check();
  await page.getByLabel("Zadání záloh").selectOption("ITEMIZED");
  await page.locator('input[name="serviceName:0"]').fill("Voda QA");
  await page.locator('input[name="serviceAmount:0"]').fill("777.25");
  await page.getByRole("button", { name: "Přidat obyvatele", exact: true }).click();
  await page.locator('input[name="occupantName:0"]').fill("Obyvatel v konceptu QA");
  page.on("dialog", dialog => dialog.accept());
  await page.reload();
  await expect(page.locator('select[name="tenantId"]')).toHaveValue(f.first.id);
  await expect(page.locator('input[name="tenantBankAccount"]')).toHaveValue(f.first.payerAccounts[0]);
  await expect(page.locator(`input[name="contractingPartyIds"][value="${f.second.id}"]`)).toBeChecked();
  await expect(page.locator('input[name="serviceAmount:0"]')).toHaveValue("777.25");
  await expect(page.locator('input[name="serviceName:0"]')).toHaveValue("Voda QA");
  await expect(page.locator('input[name="occupantName:0"]')).toHaveValue("Obyvatel v konceptu QA");
});

test("lease creation: tenant accounts and optional party rows follow deliberate selection", async ({ page }) => {
  const f = await fixture();
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova`);
  await expect(page.locator(".lease-party-role-row")).toHaveCount(0);
  await page.locator('select[name="tenantId"]').selectOption(f.first.id);
  await page.locator('input[name="tenantBankAccount"]').fill("999999/5500");
  await page.locator('select[name="tenantId"]').selectOption(f.second.id);
  await expect(page.locator('input[name="tenantBankAccount"]')).toHaveValue(f.second.payerAccounts[0]);
  await expect(page.locator("#tenant-bank-accounts option")).toHaveCount(1);
  await expect(page.locator("#tenant-bank-accounts option")).toHaveAttribute("value", f.second.payerAccounts[0]);
  await page.locator('select[name="tenantId"]').selectOption(f.company.id);
  await expect(page.locator('input[name="tenantBankAccount"]')).toHaveValue("");
  await expect(page.locator("#tenant-bank-accounts option")).toHaveCount(0);
  await page.getByLabel("Přidat osobu do smlouvy").selectOption(f.first.id);
  await expect(page.locator(".lease-party-role-row")).toHaveCount(1);
  await page.locator(`input[name="contractingPartyIds"][value="${f.first.id}"]`).check();
  await page.getByRole("button", { name: "Načíst nově založené profily" }).click();
  await expect(page.locator(`input[name="contractingPartyIds"][value="${f.first.id}"]`)).toBeChecked();
  await page.getByRole("button", { name: "Odebrat osobu ze smlouvy" }).click();
  await expect(page.locator(".lease-party-role-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Založit nového nájemníka v nové kartě →" })).toHaveAttribute("href", `/nemovitosti/${f.property.id}/najemnici/novy`);
});
