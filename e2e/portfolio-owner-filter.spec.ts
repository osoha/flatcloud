import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { currentPeriod } from "../lib/period";

const db = new PrismaClient();
const password = "Owner-Scope-Isolated-2026";
let fixtureTag: string | undefined;
test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
});
test.afterEach(async () => {
  if (!fixtureTag) return;
  const taggedName = { endsWith: ` ${fixtureTag}` };
  const taggedEmail = { endsWith: `${fixtureTag}@flatcloud.test` };
  await db.$transaction([
    db.task.deleteMany({ where: { property: { name: taggedName } } }),
    // Property deletion cascades through units, leases, charges and ownerships.
    db.property.deleteMany({ where: { name: taggedName } }),
    db.tenant.deleteMany({ where: { name: taggedName } }),
    db.owner.deleteMany({ where: { name: taggedName } }),
    db.auditLog.deleteMany({ where: { user: { email: taggedEmail } } }),
    db.user.deleteMany({ where: { email: taggedEmail } }),
  ]);
  fixtureTag = undefined;
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function selectOwner(page: Page, name: string) {
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  const picker = page.getByRole("dialog", { name: "Vybrat zobrazené objekty" });
  const ownerId = await picker.getByRole("option").filter({ hasText: name }).getAttribute("value");
  await picker.getByLabel("Vlastník jednotek", { exact: true }).selectOption(ownerId!);
  await page.getByRole("button", { name: "Použít výběr", exact: true }).click();
  await expect(page).toHaveURL(/ownerId=/);
}

test("owner portfolio includes units in shared houses, narrows money and tasks, and survives navigation", async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const tag = randomUUID(), hash = await bcrypt.hash(password, 8), period = currentPeriod();
  fixtureTag = tag;
  const admin = await db.user.create({ data: { email: `scope-admin-${tag}@flatcloud.test`, name: "Správce filtru", role: "SUPER_ADMIN", passwordHash: hash, onboardingStatus: "completed", defaultDisplayMode: "basic", isTestIdentity: true } });
  const viewer = await db.user.create({ data: { email: `scope-viewer-${tag}@flatcloud.test`, name: "Vlastník test", role: "OWNER_VIEWER", passwordHash: hash, onboardingStatus: "completed", defaultDisplayMode: "basic", isTestIdentity: true } });
  const restricted = await db.user.create({ data: { email: `scope-limited-${tag}@flatcloud.test`, name: "Pouze jednotka", role: "OWNER_VIEWER", passwordHash: hash, onboardingStatus: "completed", defaultDisplayMode: "basic", isTestIdentity: true } });
  const ondrej = await db.owner.create({ data: { name: `Ondřej Šohaj ${tag}` } });
  const pokorny = await db.owner.create({ data: { name: `František Pokorný ${tag}`, userId: viewer.id } });
  const foreign = await db.owner.create({ data: { name: `Další vlastník ${tag}` } });
  const contact = await db.owner.create({ data: { name: `SVJ kontakt ${tag}` } });
  async function house(name: string, ownerId: string) {
    return db.property.create({ data: { name: `${name} ${tag}`, address: "Testovací 1", city: "Praha", ownerId, communicationOwnerId: contact.id, ownershipMode: "UNIT_BASED" } });
  }
  const a = await house("Samostatná A", ondrej.id), b = await house("Samostatná B", ondrej.id), veska = await house("Veská", contact.id), moskevska = await house("Moskevská", contact.id);
  async function rentedUnit(propertyId: string, label: string, ownerId: string, amountCents: number) {
    const unit = await db.unit.create({ data: { propertyId, label: `${label} ${tag}`, ownerships: { create: { ownerId } }, operationalStatusEvents: { create: { status: "STANDARD", source: "MANUAL_BASELINE", effectiveAt: new Date("2020-01-01T12:00Z"), createdById: admin.id } } } });
    const tenant = await db.tenant.create({ data: { name: `Nájemce ${label} ${tag}` } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01T12:00Z"), financialTrackingFromPeriod: "2020-01", rentCents: amountCents, servicesCents: 0, variableSymbol: `${tag}-${label}`, charges: { create: { period, dueDate: new Date(Date.now() - 86400000), amountCents } } } });
    return { unit, tenant, lease };
  }
  const u1 = await rentedUnit(a.id, "Vlastní A", ondrej.id, 100000);
  await rentedUnit(b.id, "Vlastní B", ondrej.id, 200000);
  const uv = await rentedUnit(veska.id, "Vlastní Veská", ondrej.id, 300000);
  const vf = await rentedUnit(veska.id, "Cizí Veská", foreign.id, 9900000);
  const mp = await rentedUnit(moskevska.id, "Pokorný Moskevská", pokorny.id, 400000);
  await rentedUnit(moskevska.id, "Cizí Moskevská", foreign.id, 8800000);
  await db.userUnit.create({ data: { userId: restricted.id, unitId: u1.unit.id, permission: "VIEW" } });
  await db.task.createMany({ data: [
    { propertyId: veska.id, unitId: uv.unit.id, title: `Vlastní úkol ${tag}`, createdById: admin.id },
    { propertyId: veska.id, unitId: vf.unit.id, title: `Cizí úkol ${tag}`, createdById: admin.id },
    { propertyId: veska.id, title: `Společný úkol ${tag}`, createdById: admin.id },
  ] });
  await login(page, admin.email);
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  await page.getByLabel("Hledat nemovitost nebo vlastníka").fill("sohaj");
  await expect(page.locator(".scope-options label")).toHaveCount(3);
  await expect(page.locator(".scope-options")).toContainText("Veská");
  await page.getByRole("button", { name: "Zrušit změny", exact: true }).click();
  await selectOwner(page, ondrej.name);
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  await page.getByRole("button", { name: "Přidat vlastníka do oblíbených" }).click();
  await page.getByRole("button", { name: "Zrušit změny", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  await expect(page.locator(".scope-owner-preset")).toHaveCount(1);
  await expect(page.locator(".scope-owner-preset")).toContainText(ondrej.name);
  await page.getByRole("button", { name: "Zrušit změny", exact: true }).click();
  await expect(page.locator(".basic-property-card")).toHaveCount(3);
  await expect(page.locator(".basic-payments")).toContainText(/6\s?000/);
  await expect(page.locator(".basic-property-grid").first()).not.toContainText("Cizí");
  await page.screenshot({ path: info.outputPath("owner-basic-three-units.png"), fullPage: true });
  await page.locator(".basic-tasks").click();
  await expect(page).toHaveURL(new RegExp(`/ukoly\\?ownerId=${ondrej.id}`));
  await expect(page.locator("main")).toContainText(`Vlastní úkol ${tag}`);
  await expect(page.locator("main")).toContainText(`Společný úkol ${tag}`);
  await expect(page.locator("main")).not.toContainText(`Cizí úkol ${tag}`);
  await page.goto(`/reporty?view=collections&ownerId=${ondrej.id}`);
  await expect(page.locator("main")).toContainText(/6\s?000/);
  await expect(page.locator("main")).not.toContainText(/99\s?000/);
  await page.getByText("Období a podrobnosti", { exact: true }).click();
  await page.getByRole("link", { name: "YTD", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`ownerId=${ondrej.id}`));
  await page.goto(`/smlouvy?ownerId=${ondrej.id}`);
  await expect(page.locator(".registry-table tbody tr")).toHaveCount(3);
  await page.goto(`/portfolio/kvalita?ownerId=${ondrej.id}`);
  await expect(page.locator(".quality-kpis")).toContainText("Vybrané jednotky3");
  await page.goto(`/portfolio?ownerId=${ondrej.id}`);
  await page.locator(".sidebar").getByRole("button", { name: "Profi", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`ownerId=${ondrej.id}`));
  await expect(page.locator(".portfolio-table-card tbody tr")).toHaveCount(3);
  await expect(page.locator(".v21-stat-grid").first()).toContainText(/6\s?000/);
  await page.locator(".sidebar").getByRole("button", { name: "Basic", exact: true }).click();
  await expect(page.locator(".basic-property-card")).toHaveCount(3);
  await selectOwner(page, pokorny.name);
  await expect(page.locator(".basic-property-card")).toHaveCount(1);
  await expect(page.locator(".basic-property-card")).toContainText(mp.unit.label);
  await page.goto(`/portfolio?ownerId=${ondrej.id}&properties=${veska.id}`);
  await expect(page.locator(".basic-property-card")).toHaveCount(1);
  await page.goto(`/portfolio?ownerId=${ondrej.id}&properties=`);
  await expect(page.locator(".basic-property-card")).toHaveCount(0);
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  await page.getByRole("button", { name: "Vybrat vše ve správě", exact: true }).click();
  await page.getByRole("button", { name: "Použít výběr", exact: true }).click();
  await expect(page).not.toHaveURL(/ownerId=/);
  const limitedPage = await browser.newPage();
  await login(limitedPage, restricted.email);
  await limitedPage.goto(`/portfolio?ownerId=${ondrej.id}`);
  await expect(limitedPage.locator(".basic-property-card")).toHaveCount(1);
  await limitedPage.goto(`/portfolio?ownerId=${foreign.id}`);
  await expect(limitedPage.locator(".basic-property-card")).toHaveCount(0);
  await limitedPage.close();
  const ownerPage = await browser.newPage();
  await login(ownerPage, viewer.email);
  await selectOwner(ownerPage, pokorny.name);
  await expect(ownerPage.locator(".basic-property-card")).toHaveCount(1);
  await ownerPage.goto(`/reporty?view=collections&ownerId=${pokorny.id}`);
  await expect(ownerPage.locator("main")).toContainText(/4\s?000/);
  await expect(ownerPage.locator("main")).not.toContainText(/88\s?000/);
  await ownerPage.close();
});

test("search finds a house-level owner without treating that name as the legal unit owner", async ({ page }) => {
  const tag = randomUUID(); fixtureTag = tag;
  const admin = await db.user.create({ data: { email: `scope-alias-${tag}@flatcloud.test`, name: "Správce hledání", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 8), onboardingStatus: "completed", defaultDisplayMode: "basic", isTestIdentity: true } });
  const person = await db.owner.create({ data: { name: `Ondřej Šohaj ${tag}` } });
  const company = await db.owner.create({ data: { name: `BrickFlow ${tag}` } });
  const association = await db.owner.create({ data: { name: `SVJ ${tag}` } });
  const property = await db.property.create({ data: { name: `Veská ${tag}`, address: "Testovací 1", city: "Plzeň", ownershipMode: "UNIT_BASED", ownerId: association.id, communicationOwnerId: association.id, ownerships: { create: [{ ownerId: person.id, shareBasisPoints: 0 }, { ownerId: association.id, shareBasisPoints: 10000 }] } } });
  await db.unit.create({ data: { propertyId: property.id, label: "Firemní jednotka", ownerships: { create: { ownerId: company.id } } } });
  await login(page, admin.email);
  await page.getByRole("button", { name: /Rozsah správy/ }).click();
  await page.getByLabel("Hledat nemovitost nebo vlastníka").fill(`sohaj ${tag}`);
  await expect(page.locator(".scope-options label")).toHaveCount(1);
  await expect(page.locator(".scope-options")).toContainText(property.name);
  const ownerSelect = page.getByLabel("Vlastník jednotek", { exact: true });
  await expect(ownerSelect.locator("option").filter({ hasText: person.name })).toHaveCount(0);
  await expect(ownerSelect.locator("option").filter({ hasText: company.name })).toHaveCount(1);
});
