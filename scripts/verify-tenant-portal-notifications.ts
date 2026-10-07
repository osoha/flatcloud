import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { collectTenantPortalNotifications, enqueueTenantTaskNotification, processTenantPortalNotifications, publishTenantAnnouncementNotification, tenantDeliveryFailure, tenantMailSafety } from "../lib/tenant-portal-notifications";
import type { MailInput } from "../lib/email";
import { businessDateKey, businessDateKeyToInstant } from "../lib/calendar";

let count = 0;
async function check(name: string, run: () => unknown | Promise<unknown>) { await run(); console.log(`✓ ${++count}. ${name}`); }
async function main() {
  await check("sandbox, synthetic identities and non-HTTPS fail closed before SMTP", () => {
    const input = { origin: "https://flatberry.cz", email: "tenant@example.com", isTestIdentity: false };
    assert.equal(tenantMailSafety(input), null);
    for (const change of [{ branch: "sandbox/ux-agent" }, { origin: "https://flatcloud-ux-sandbox.onrender.com" }, { externalUrl: "https://sandbox.example.com" }, { isTestIdentity: true }, { email: "test@flatcloud.test" }, { origin: "http://flatberry.cz" }]) assert.ok(tenantMailSafety({ ...input, ...change }));
  });
  await check("SMTP uncertainty is never retried; known refusals have bounded retries", () => {
    assert.equal(tenantDeliveryFailure({ code: "ECONNRESET", command: "DATA" }, 1), "UNKNOWN");
    assert.equal(tenantDeliveryFailure({ code: "ECONNECTION" }, 1), "RETRY");
    assert.equal(tenantDeliveryFailure({ responseCode: 450 }, 1), "RETRY");
    assert.equal(tenantDeliveryFailure({ responseCode: 550 }, 1), "FAILED");
    assert.equal(tenantDeliveryFailure({ code: "EAUTH" }, 1), "FAILED");
    assert.equal(tenantDeliveryFailure({ responseCode: 450 }, 3), "FAILED");
  });
  if (process.argv.includes("--rules-only")) return;
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  process.env.APP_URL = "https://flatberry.test";
  const tag = `PORTAL_NOTIFY_${randomUUID()}`, now = new Date();
  const actor = await prisma.user.create({ data: { name: tag, email: `${tag}@flatcloud.test`, passwordHash: "test-only", role: "TENANT", isTestIdentity: true } });
  const staff = await prisma.user.create({ data: { name: `${tag}_staff`, email: `${tag}_staff@flatcloud.test`, passwordHash: "test-only", role: "MANAGER", isTestIdentity: true } });
  const owner = await prisma.owner.create({ data: { name: tag } });
  const property = await prisma.property.create({ data: { name: tag, ownerId: owner.id, address: "Testovací 1", city: "Praha" } });
  const unit = await prisma.unit.create({ data: { propertyId: property.id, label: "1" } });
  const tenant = await prisma.tenant.create({ data: { name: tag, email: actor.email } });
  const otherTenant = await prisma.tenant.create({ data: { name: `${tag}_other` } });
  const lease = await prisma.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date(now.getTime() - 30 * 86400000), variableSymbol: tag, financialTrackingFromPeriod: businessDateKey(new Date(now.getTime() - 30 * 86400000)).slice(0, 7), rentCents: 100000, servicesCents: 0, autoChargesEnabled: false } });
  await prisma.tenantPortalAccess.create({ data: { userId: actor.id, tenantId: tenant.id } });
  await prisma.taskNotificationPreference.create({ data: { userId: actor.id, emailEnabled: false, mentions: false, assignments: false, comments: false, deadlines: false, statusChanges: false } });
  const taskIds: string[] = [], announcementIds: string[] = [], mails: MailInput[] = [];
  const transport = async (mail: MailInput) => { mails.push(mail); return { sent: true }; };
  const task = async () => { const row = await prisma.task.create({ data: { title: `${tag} INTERNAL SECRET TITLE`, description: "INTERNAL SECRET DESCRIPTION", tenantPortalTitle: "Dotaz k bydlení <test>", tenantPortalBody: "Veřejný popis", tenantPortalPublishedAt: new Date(), tenantPortalPublishedById: staff.id, propertyId: property.id, unitId: unit.id, leaseId: lease.id, tenantId: tenant.id, createdById: staff.id } }); taskIds.push(row.id); return row; };
  const processOwn = (extra: Parameters<typeof processTenantPortalNotifications>[0] = {}) => processTenantPortalNotifications({ tenantId: tenant.id, transport, ...extra });
  const enqueue = (taskId: string, key = randomUUID()) => enqueueTenantTaskNotification(prisma, { taskId, kind: "STATUS", eventKey: key });
  try {
    await check("mandatory delivery ignores staff preferences, dedupes and never exposes internal task text", async () => {
      const row = await task(), key = randomUUID();
      assert.equal(await enqueue(row.id, key), 1); assert.equal(await enqueue(row.id, key), 0);
      assert.equal((await processOwn({ taskId: row.id })).sent, 1);
      assert.equal(mails.length, 1); assert.equal(mails[0].to, actor.email); assert.ok(!mails[0].text.includes("INTERNAL SECRET"));
      assert.ok(mails[0].html.includes("&lt;test&gt;")); assert.ok(mails[0].text.includes(`#zpravy-spravci-${lease.id}--${row.id}`));
      assert.ok(!mails[0].text.includes("Nastavit upozornění"));
      assert.equal(mails[0].attachments, undefined, "Routine task notification must not create a PDF");
    });
    await check("public replies deliver while internal entries cannot enqueue or escape a forged queue row", async () => {
      const row = await task();
      const privateEntry = await prisma.taskEntry.create({ data: { taskId: row.id, authorId: staff.id, body: "PRIVATE ENTRY", visibility: "INTERNAL" } });
      assert.equal(await enqueueTenantTaskNotification(prisma, { taskId: row.id, kind: "REPLY", eventKey: randomUUID(), entryId: privateEntry.id }), 0);
      await enqueue(row.id); await prisma.tenantPortalNotification.updateMany({ where: { taskId: row.id }, data: { entryId: privateEntry.id, kind: "REPLY" } });
      assert.equal((await processOwn({ taskId: row.id })).skipped, 1);
      const publicEntry = await prisma.taskEntry.create({ data: { taskId: row.id, authorId: staff.id, body: "Veřejná odpověď", visibility: "TENANT_VISIBLE" } });
      await enqueueTenantTaskNotification(prisma, { taskId: row.id, kind: "REPLY", eventKey: randomUUID(), entryId: publicEntry.id });
      assert.equal((await processOwn({ taskId: row.id })).sent, 1); assert.ok(mails.at(-1)!.text.includes("Veřejná odpověď"));
    });
    await check("revoked access, replaced contact, inactive property and withdrawn task block queued mail", async () => {
      for (const change of ["access", "email", "property", "publication"]) {
        const row = await task(); await enqueue(row.id);
        if (change === "access") await prisma.tenantPortalAccess.delete({ where: { userId_tenantId: { userId: actor.id, tenantId: tenant.id } } });
        if (change === "email") await prisma.tenant.update({ where: { id: tenant.id }, data: { communicationEmail: "replacement@example.test" } });
        if (change === "property") await prisma.property.update({ where: { id: property.id }, data: { active: false } });
        if (change === "publication") await prisma.task.update({ where: { id: row.id }, data: { tenantPortalPublishedAt: null } });
        assert.equal((await processOwn({ taskId: row.id })).skipped, 1, change);
        if (change === "access") await prisma.tenantPortalAccess.create({ data: { userId: actor.id, tenantId: tenant.id } });
        if (change === "email") await prisma.tenant.update({ where: { id: tenant.id }, data: { communicationEmail: null } });
        if (change === "property") await prisma.property.update({ where: { id: property.id }, data: { active: true } });
      }
    });
    await check("payer-only or ended lease never receives operational events", async () => {
      const row = await task();
      await prisma.lease.update({ where: { id: lease.id }, data: { tenantId: otherTenant.id } });
      await prisma.leaseParty.create({ data: { leaseId: lease.id, tenantId: tenant.id, role: "PAYER" } });
      assert.equal(await enqueue(row.id), 0);
      await prisma.leaseParty.deleteMany({ where: { leaseId: lease.id } });
      await prisma.lease.update({ where: { id: lease.id }, data: { tenantId: tenant.id, cancelledAt: new Date() } });
      assert.equal(await enqueue(row.id), 0);
      await prisma.lease.update({ where: { id: lease.id }, data: { cancelledAt: null } });
    });
    await check("concurrent workers claim one event once", async () => {
      const row = await task(); await enqueue(row.id); const before = mails.length;
      const results = await Promise.all([processOwn({ taskId: row.id }), processOwn({ taskId: row.id })]);
      assert.equal(results.reduce((n, result) => n + result.sent, 0), 1); assert.equal(mails.length - before, 1);
    });
    await check("ambiguous SMTP and stale sending claims become UNKNOWN and never repeat", async () => {
      const row = await task(); await enqueue(row.id); let attempts = 0;
      await processOwn({ taskId: row.id, transport: async () => { attempts++; throw Object.assign(new Error("Network after DATA"), { code: "ECONNRESET", command: "DATA" }); } });
      assert.equal((await prisma.tenantPortalNotification.findFirstOrThrow({ where: { taskId: row.id } })).status, "UNKNOWN");
      await processOwn({ taskId: row.id }); assert.equal(attempts, 1);
      await enqueue(row.id); await prisma.tenantPortalNotification.updateMany({ where: { taskId: row.id, status: "PENDING" }, data: { status: "SENDING", claimedAt: new Date(now.getTime() - 16 * 60000) } });
      await processOwn({ taskId: row.id, now }); assert.equal(await prisma.tenantPortalNotification.count({ where: { taskId: row.id, status: "UNKNOWN" } }), 2);
    });
    await check("known SMTP failure retries at most three times", async () => {
      const row = await task(); await enqueue(row.id); let attempts = 0;
      const failed = async () => { attempts++; throw Object.assign(new Error("Temporary reject"), { responseCode: 450 }); };
      for (let n = 0; n < 4; n++) await processOwn({ taskId: row.id, now: new Date(Date.now() + n * 3600001), transport: failed });
      assert.equal(attempts, 3); assert.equal((await prisma.tenantPortalNotification.findFirstOrThrow({ where: { taskId: row.id } })).status, "FAILED");
    });
    await check("default transport skips test identities without invoking SMTP", async () => {
      const row = await task(); await enqueue(row.id);
      assert.equal((await processTenantPortalNotifications({ tenantId: tenant.id, taskId: row.id })).skipped, 1);
    });
    await check("old announcements never send; scheduled explicit publication activates once and withdrawal blocks delivery", async () => {
      const create = async (startsAt: Date) => { const row = await prisma.announcement.create({ data: { title: tag, body: "Veřejné oznámení", createdById: staff.id, startsAt, audiences: { create: { kind: "TENANT_LEASE", leaseId: lease.id } } } }); announcementIds.push(row.id); return row; };
      const old = await create(new Date(now.getTime() - 86400000));
      const start = new Date(Date.now() + 86400000), future = await create(start);
      await prisma.$transaction(tx => publishTenantAnnouncementNotification(tx, future.id));
      assert.equal(await prisma.tenantPortalNotification.count({ where: { announcementId: future.id } }), 0);
      await collectTenantPortalNotifications(new Date(start.getTime() + 1000));
      assert.equal(await prisma.tenantPortalNotification.count({ where: { announcementId: old.id } }), 0);
      assert.equal(await prisma.tenantPortalNotification.count({ where: { announcementId: future.id } }), 1);
      await collectTenantPortalNotifications(new Date(start.getTime() + 2000));
      assert.equal(await prisma.tenantPortalNotification.count({ where: { announcementId: future.id } }), 1);
      await prisma.announcement.update({ where: { id: future.id }, data: { active: false } });
      assert.equal((await processOwn({ now: new Date(start.getTime() + 3000) })).skipped, 1);
    });
    await check("baseline skips old task state, subsequent changes queue once and changed deadline blocks stale reminder", async () => {
      const row = await task();
      await collectTenantPortalNotifications();
      assert.equal(await prisma.tenantPortalNotification.count({ where: { taskId: row.id } }), 0);
      await prisma.task.update({ where: { id: row.id }, data: { status: "IN_PROGRESS" } });
      await collectTenantPortalNotifications(); await collectTenantPortalNotifications();
      assert.equal(await prisma.tenantPortalNotification.count({ where: { taskId: row.id, kind: "STATUS" } }), 1);
      await processOwn({ taskId: row.id });
      const due = new Date(Date.now() + 3600000);
      await prisma.task.update({ where: { id: row.id }, data: { dueAt: due } });
      await collectTenantPortalNotifications(); await collectTenantPortalNotifications();
      assert.equal(await prisma.tenantPortalNotification.count({ where: { taskId: row.id, kind: "DUE_SOON" } }), 1);
      await prisma.task.update({ where: { id: row.id }, data: { dueAt: new Date(due.getTime() + 86400000) } });
      assert.equal((await processOwn({ taskId: row.id })).skipped, 1);
    });
    await check("midnight deadlines receive one next-day reminder using Prague calendar dates", async () => {
      const row = await task(), today = businessDateKey(now), dueAt = businessDateKeyToInstant(today);
      await prisma.task.update({ where: { id: row.id }, data: { dueAt } });
      await prisma.tenantPortalNotificationSnapshot.create({ data: { taskId: row.id, status: row.status, dueAt, publishedAt: row.tenantPortalPublishedAt, observedAt: row.updatedAt, trackingSince: new Date(now.getTime() - 3 * 86400000) } });
      const tomorrowAfternoon = new Date(`${today}T14:00:00Z`); tomorrowAfternoon.setUTCDate(tomorrowAfternoon.getUTCDate() + 1);
      await collectTenantPortalNotifications(tomorrowAfternoon); await collectTenantPortalNotifications(tomorrowAfternoon);
      assert.equal(await prisma.tenantPortalNotification.count({ where: { taskId: row.id, kind: "OVERDUE" } }), 1);
    });
  } finally {
    await prisma.tenantPortalNotification.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenantPortalNotificationSnapshot.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.announcement.deleteMany({ where: { id: { in: announcementIds } } });
    await prisma.tenantPortalAccess.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.leaseParty.deleteMany({ where: { leaseId: lease.id } });
    await prisma.lease.delete({ where: { id: lease.id } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, otherTenant.id] } } });
    await prisma.unit.delete({ where: { id: unit.id } }); await prisma.property.delete({ where: { id: property.id } }); await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, staff.id] } } });
  }
}
main().then(() => console.log(`Tenant portal notifications: ${count} checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
