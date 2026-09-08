import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma as db } from "../lib/db";
import { loadAnnualOwnerPackage } from "../lib/reporting/annual-owner-package";
import { documentAccessWhere } from "../lib/documents/access";
import { createDistributionOpportunity, createDistributionProspect } from "../lib/distribution/crm";
import { createWelcomeLetter, updateWelcomeLetter } from "../lib/distribution/welcome-letters";
import { listQuarterlyPropertyPhotoCandidates, resolveQuarterlyPropertyCandidateImage, selectQuarterlyPropertyPrimaryPhoto, selectQuarterlyPropertySupportivePhoto } from "../lib/reporting/quarterly-report-media-service";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const marker = "R24_AGENT_QA_2026_09";
test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("R24 visibility fixtures require local/CI DB"); });
test.afterAll(async () => { await db.$disconnect(); });
async function fixture(propertyId?: string) {
  const admin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", active: true } });
  const unit = await db.unit.findFirstOrThrow({ where: propertyId ? { propertyId } : { leases: { some: {} }, property: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 } } } });
  const tag = `${marker}_${randomUUID()}`;
  const task = await db.task.create({ data: { title: `${tag} task`, propertyId: unit.propertyId, unitId: unit.id, category: "MAINTENANCE", createdById: admin.id } });
  const documents = [];
  for (const visibility of ["INTERNAL", "OWNER_VISIBLE"] as const) {
    const title = `${tag}_${visibility}`;
    const entry = await db.taskEntry.create({ data: { taskId: task.id, authorId: admin.id, kind: "COMMENT", body: title, visibility } });
    const asset = await db.fileAsset.create({ data: { storageKey: title, previewStorageKey: `${title}_preview`, thumbnailStorageKey: `${title}_thumbnail`, originalName: `${title}.png`, mimeType: "image/png", sizeBytes: 1, sha256: "0".repeat(64), uploadedById: admin.id } });
    documents.push(await db.document.create({ data: { propertyId: unit.propertyId, unitId: unit.id, taskId: task.id, taskEntryId: entry.id, fileAssetId: asset.id, category: "PHOTO", title: `${title}.png`, createdById: admin.id } }));
  }
  return { admin, unit, task, tag, privateDoc: documents[0], publicDoc: documents[1] };
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}
async function post(page: Page, taskId: string, form: Record<string, string>, action = "entries") {
  return new URL(await page.evaluate(async ({ taskId, form, action }) => (await fetch(`/api/tasks/${taskId}/${action}`, { method: "POST", body: new URLSearchParams(form) })).url, { taskId, form, action })).searchParams;
}
for (const scope of ["property-view", "unit-view", "property-edit", "unit-edit", "admin", "foreign"] as const) {
  test(`R24 visibility: ${scope} reads only authorized thread and attachments`, async ({ page }) => {
    const f = await fixture();
    const seed = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.technicalManager } });
    const actor = await db.user.create({ data: { name: `${marker} ${scope}`, email: `${randomUUID()}@flatcloud.test`, passwordHash: seed.passwordHash, isTestIdentity: true, role: scope === "admin" ? "SUPER_ADMIN" : "OWNER_VIEWER" } });
    if (scope.startsWith("property")) await db.userProperty.create({ data: { userId: actor.id, propertyId: f.unit.propertyId, permission: scope.endsWith("edit") ? "EDIT" : "VIEW" } });
    if (scope.startsWith("unit")) await db.userUnit.create({ data: { userId: actor.id, unitId: f.unit.id, permission: scope.endsWith("edit") ? "EDIT" : "VIEW" } });
    if (scope === "foreign") {
      const other = await db.property.findFirstOrThrow({ where: { id: { not: f.unit.propertyId } } });
      await db.userProperty.create({ data: { userId: actor.id, propertyId: other.id, permission: "EDIT" } });
    }
    const editor = scope.endsWith("edit") || scope === "admin";
    await login(page, actor.email);
    const response = await page.goto(`/ukoly/${f.task.id}`);
    if (scope === "foreign") expect(response?.status()).toBe(404);
    else {
      await expect(page.getByText(`${f.tag}_OWNER_VISIBLE`, { exact: true })).toBeVisible();
      await expect(page.getByText(`${f.tag}_INTERNAL`, { exact: true })).toHaveCount(editor ? 1 : 0);
      await expect(page.getByLabel("Viditelnost záznamu", { exact: true })).toHaveCount(editor ? 1 : 0);
    }
    const allowed = await db.document.findMany({ where: { AND: [documentAccessWhere(actor), { id: { in: [f.privateDoc.id, f.publicDoc.id] } }] } });
    expect(allowed.map(d => d.id).sort()).toEqual((scope === "foreign" ? [] : editor ? [f.privateDoc.id, f.publicDoc.id] : [f.publicDoc.id]).sort());
    await page.goto(`/dokumenty?q=${encodeURIComponent(f.tag)}`);
    await expect(page.getByText(f.privateDoc.title, { exact: true })).toHaveCount(editor ? 1 : 0);
    if (!editor) {
      for (const doc of scope === "foreign" ? [f.privateDoc, f.publicDoc] : [f.privateDoc]) {
        for (const variant of ["original", "preview", "thumbnail"]) {
          const denied = await page.evaluate(async ({ id, variant }) => { const r = await fetch(`/api/documents/${id}/download?variant=${variant}`); return { status: r.status, location: r.headers.get("location"), body: await r.text() }; }, { id: doc.id, variant });
          expect(denied).toEqual({ status: 404, location: null, body: "Not found" });
        }
      }
      for (const visibility of ["INTERNAL", "OWNER_VISIBLE"]) expect((await post(page, f.task.id, { body: `${marker} forbidden`, visibility })).get("error")).toContain("Nemáte oprávnění");
      expect(await db.taskEntry.count({ where: { taskId: f.task.id } })).toBe(2);
    }
  });
}

test("R24 visibility migration preserves historical sharing and defaults new rows to internal", async () => {
  const rollback = new Error("rollback migration fixture");
  await expect(db.$transaction(async tx => {
    const schema = `r24_b_${randomUUID().replaceAll("-", "")}`;
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe('CREATE TABLE "TaskEntry" (id TEXT PRIMARY KEY)');
    await tx.$executeRawUnsafe('INSERT INTO "TaskEntry" (id) VALUES (\'historical\')');
    const sql = readFileSync("prisma/migrations/20260908180000_r24_task_entry_visibility/migration.sql", "utf8");
    for (const statement of sql.split(";").filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
    await tx.$executeRawUnsafe('INSERT INTO "TaskEntry" (id) VALUES (\'new\')');
    expect(await tx.$queryRawUnsafe('SELECT id, visibility::text AS visibility FROM "TaskEntry" ORDER BY id')).toEqual([{ id: "historical", visibility: "OWNER_VISIBLE" }, { id: "new", visibility: "INTERNAL" }]);
    throw rollback;
  })).rejects.toBe(rollback);
});

test("R24 visibility composer defaults internal, explicit sharing works, invalid input is atomic", async ({ page }) => {
  const f = await fixture();
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.assetManager } });
  await login(page, actor.email);
  await page.goto(`/ukoly/${f.task.id}`);
  await expect(page.getByLabel("Viditelnost záznamu", { exact: true })).toHaveValue("INTERNAL");
  await page.getByLabel("Nový záznam", { exact: true }).fill(`${marker} private UI`);
  await page.getByRole("button", { name: "Přidat do vlákna" }).click();
  await expect(page.getByText("Záznam byl přidán do vlákna.", { exact: true })).toBeVisible();
  expect((await db.taskEntry.findFirstOrThrow({ where: { taskId: f.task.id, body: `${marker} private UI` } })).visibility).toBe("INTERNAL");
  await page.getByLabel("Viditelnost záznamu", { exact: true }).selectOption("OWNER_VISIBLE");
  await page.getByLabel("Nový záznam", { exact: true }).fill(`${marker} shared UI`);
  await page.getByRole("button", { name: "Přidat do vlákna" }).click();
  await expect(page.getByText(`${marker} shared UI`, { exact: true })).toBeVisible();
  expect((await db.taskEntry.findFirstOrThrow({ where: { taskId: f.task.id, body: `${marker} shared UI` } })).visibility).toBe("OWNER_VISIBLE");
  expect((await post(page, f.task.id, { body: "invalid", visibility: "PUBLIC" })).get("error")).toContain("platnou viditelnost");
  expect((await post(page, f.task.id, { body: "invalid", visibility: "PUBLIC" }, "close")).get("error")).toContain("platnou viditelnost");
  expect(await db.taskEntry.count({ where: { taskId: f.task.id } })).toBe(4);
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).status).toBe("OPEN");
  expect((await post(page, f.task.id, { body: `${marker} internal close` }, "close")).get("ok")).toBeTruthy();
  expect((await db.taskEntry.findFirstOrThrow({ where: { taskId: f.task.id, kind: "STATUS" } })).visibility).toBe("INTERNAL");
});

test("R24 internal promise cannot copy private content into shared lease or deadline", async ({ page }) => {
  const f = await fixture();
  const lease = await db.lease.findFirstOrThrow({ where: { unitId: f.unit.id } });
  await db.task.update({ where: { id: f.task.id }, data: { leaseId: lease.id, category: "COLLECTION" } });
  await login(page, R24_ROLE_USERS.assetManager);
  const promise = { kind: "PROMISE", body: `${f.tag} private promise`, promiseDate: "2026-09-30", promiseAmount: "987.65" };
  expect((await post(page, f.task.id, promise)).get("ok")).toBeTruthy();
  const unchanged = await db.lease.findUniqueOrThrow({ where: { id: lease.id } });
  for (const field of ["collectionNote", "promisedPaymentDate", "promisedAmountCents"] as const) expect(unchanged[field]).toEqual(lease[field]);
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).dueAt).toBeNull();
  expect((await post(page, f.task.id, { ...promise, visibility: "OWNER_VISIBLE", body: `${f.tag} shared promise` })).get("ok")).toBeTruthy();
  const shared = await db.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(shared.collectionNote).toBe(`${f.tag} shared promise`);
  expect(shared.promisedAmountCents).toBe(98765);
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).dueAt).toEqual(shared.promisedPaymentDate);
});

test("R24 internal attachments cannot enter quarterly report candidates or either photo slot", async () => {
  const f = await fixture();
  const snapshot = await db.quarterSnapshot.create({ data: { propertyId: f.unit.propertyId, asOfDate: new Date(), year: 2026, quarter: 3, revision: 1, source: "CALCULATED", schemaVersion: 1, calculatorVersion: "R24_TEST", data: {}, quality: {} } });
  const group = await db.reportingGroup.create({ data: { name: `${f.tag} report` } });
  const report = await db.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 3, revision: 1, asOfDate: new Date(), createdById: f.admin.id, propertyReports: { create: { propertyId: f.unit.propertyId, propertyNameSnapshot: "TEST", propertyAddressSnapshot: "TEST", snapshotId: snapshot.id } } } });
  const input = { reportingGroupId: group.id, reportId: report.id, propertyId: f.unit.propertyId };
  const candidates = await listQuarterlyPropertyPhotoCandidates(input, f.admin);
  expect(candidates.some(d => d.id === f.publicDoc.id)).toBe(true);
  expect(candidates.some(d => d.id === f.privateDoc.id)).toBe(false);
  await expect(resolveQuarterlyPropertyCandidateImage({ ...input, documentId: f.privateDoc.id }, f.admin)).rejects.toThrow("not found");
  for (const select of [selectQuarterlyPropertyPrimaryPhoto, selectQuarterlyPropertySupportivePhoto]) {
    await expect(select({ ...input, sourceDocumentId: f.privateDoc.id }, f.admin)).rejects.toThrow("not available");
    expect((await select({ ...input, sourceDocumentId: f.publicDoc.id }, f.admin)).sourceDocumentId).toBe(f.publicDoc.id);
  }
  expect((await db.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("DRAFT");
});

test("R24 welcome draft rejects internal attachments without changing the draft", async () => {
  const f = await fixture();
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.distributionLead } });
  const prospect = await createDistributionProspect(actor, { name: f.tag, email: "r24-visibility@example.invalid" });
  const opportunity = await createDistributionOpportunity(actor, { prospectId: prospect.id, unitId: f.unit.id, stage: "WON", askingPriceCents: 10000, offeredPriceCents: 10000, nextActionAt: null, note: "TEST" });
  const letter = await createWelcomeLetter(actor, { opportunityId: opportunity.id, ownershipRegisteredAt: new Date("2026-09-01T12:00:00Z") });
  await expect(updateWelcomeLetter(actor, letter.id, { ...letter, documentIds: [f.privateDoc.id] })).rejects.toThrow("není dostupná");
  expect(await db.distributionWelcomeLetterAttachment.count({ where: { welcomeLetterId: letter.id } })).toBe(0);
  await updateWelcomeLetter(actor, letter.id, { ...letter, documentIds: [f.publicDoc.id] });
  expect((await db.distributionWelcomeLetterAttachment.findFirstOrThrow({ where: { welcomeLetterId: letter.id } })).documentId).toBe(f.publicDoc.id);
  const result = await db.distributionWelcomeLetter.findUniqueOrThrow({ where: { id: letter.id } });
  expect(result.status).toBe("DRAFT");
  expect(result.sentAt).toBeNull();
});

test("R24 unit EDIT does not expose internal notes from sibling units under property VIEW", async ({ page }) => {
  const f = await fixture();
  const sibling = await db.unit.findFirstOrThrow({ where: { propertyId: f.unit.propertyId, id: { not: f.unit.id } } });
  const seed = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.technicalManager } });
  const actor = await db.user.create({ data: { name: `${marker} mixed scope`, email: `${randomUUID()}@flatcloud.test`, role: "OWNER_VIEWER", isTestIdentity: true, passwordHash: seed.passwordHash, memberships: { create: { propertyId: f.unit.propertyId, permission: "VIEW" } }, unitMemberships: { create: { unitId: sibling.id, permission: "EDIT" } } } });
  await login(page, actor.email);
  await page.goto(`/ukoly/${f.task.id}`);
  await expect(page.getByText(`${f.tag}_OWNER_VISIBLE`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${f.tag}_INTERNAL`, { exact: true })).toHaveCount(0);
  expect(await db.document.count({ where: { AND: [documentAccessWhere(actor), { id: f.privateDoc.id }] } })).toBe(0);
});

test("R24 annual owner package cannot count internal invoices as shared evidence", async () => {
  const property = await db.property.findFirstOrThrow({ where: { ownershipMode: "WHOLE_OBJECT", active: true, units: { some: {} } } });
  const f = await fixture(property.id);
  const cost = await db.propertyCost.create({ data: { propertyId: property.id, title: f.tag, kind: "OPEX", status: "ACTUAL", effectiveAt: new Date("2026-09-01T12:00:00Z"), amountCents: 12345 } });
  await db.document.update({ where: { id: f.privateDoc.id }, data: { propertyCostId: cost.id, category: "INVOICE" } });
  const privatePackage = await loadAnnualOwnerPackage(f.admin, { ownerId: property.ownerId, year: 2026 });
  const privateRow = privatePackage.expenseRows.find(row => row.id === cost.id);
  expect(privateRow).toBeDefined();
  expect(privateRow?.documentCount).toBe(0);
  expect(privateRow?.accountingDocumentCount).toBe(0);
  await db.document.update({ where: { id: f.publicDoc.id }, data: { propertyCostId: cost.id, category: "INVOICE" } });
  const sharedPackage = await loadAnnualOwnerPackage(f.admin, { ownerId: property.ownerId, year: 2026 });
  expect(sharedPackage.expenseRows.find(row => row.id === cost.id)?.accountingDocumentCount).toBe(1);
});
