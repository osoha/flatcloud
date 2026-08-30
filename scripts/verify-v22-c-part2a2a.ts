import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { businessDateKey } from "../lib/calendar";
import { prisma } from "../lib/db";
import { reportingScopeForUser } from "../lib/reporting/access";
import { addReportingGroupMember, addReportingGroupPropertyInterval, backofficePermissionForGroup, canAdminReportingBackoffice, canCreateReportingGroup, canReadReportingBackoffice, changeReportingGroupMember, createReportingGroup, effectiveBackofficePermission, parseReportingBusinessDate, reportingBackofficeNavVisible, reportingGroupPermissions, updateReportingGroup } from "../lib/reporting/backoffice-access";
import { validateReportingGroupPropertyIntervals } from "../lib/reporting/group-property-intervals";

let count = 0; const check = async (name: string, test: () => unknown | Promise<unknown>) => { await test(); count += 1; console.log(`✓ ${count}. ${name}`); };
const read = (path: string) => fs.readFileSync(path, "utf8");
const service = read("lib/reporting/backoffice-access.ts"), shell = read("components/Shell.tsx"), dashboard = read("app/reporty/kvartalni/page.tsx"), detail = read("app/reporty/kvartalni/[groupId]/page.tsx");
const routePaths = ["app/api/reporting-groups/route.ts", "app/api/reporting-groups/[groupId]/route.ts", "app/api/reporting-groups/[groupId]/members/route.ts", "app/api/reporting-groups/[groupId]/members/[userId]/route.ts", "app/api/reporting-groups/[groupId]/properties/route.ts", "app/api/reporting-groups/[groupId]/properties/[intervalId]/route.ts"], routes = routePaths.map(read).join("\n");

async function verifyDatabaseBehavior() {
  const marker = `verify-v22c-part2a2a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = (label: string) => `${marker}-${label}@example.test`;
  const users = await Promise.all([
    ["super", UserRole.SUPER_ADMIN], ["edit", UserRole.OWNER_VIEWER], ["admin", UserRole.OWNER_VIEWER], ["member", UserRole.OWNER_VIEWER],
  ].map(([label, role]) => prisma.user.create({ data: { email: email(label), name: `${marker}-${label}`, passwordHash: "verifier-not-a-login", role: role as UserRole, active: true } })));
  const [superAdmin, editor, admin, member] = users;
  const actor = (user: { id: string; role: UserRole }) => ({ id: user.id, role: user.role });
  let ownerId: string | undefined;
  let propertyId: string | undefined;
  try {
    const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } }); ownerId = owner.id;
    const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "Verifier 1", city: "Praha", ownerId: owner.id } }); propertyId = property.id;

    const group = await createReportingGroup({ name: `${marker}-group-a`, description: "db verification", active: true }, actor(superAdmin));
    const unrelated = await createReportingGroup({ name: `${marker}-group-b`, description: null, active: true }, actor(superAdmin));
    await check("DB: SUPER_ADMIN creation has no implicit membership and one atomic audit", async () => {
      assert.equal(await prisma.reportingGroupMember.count({ where: { reportingGroupId: group.id, userId: superAdmin.id } }), 0);
      const audits = await prisma.auditLog.findMany({ where: { action: "REPORTING_GROUP_CREATED", entityType: "ReportingGroup", entityId: group.id } });
      assert.equal(audits.length, 1); assert.equal(audits[0].userId, superAdmin.id);
    });
    await check("DB: non-SUPER_ADMIN creation is rejected without group or audit", async () => {
      const name = `${marker}-forbidden`;
      await assert.rejects(createReportingGroup({ name, active: true }, actor(editor)), /pouze hlavní administrátor/);
      assert.equal(await prisma.reportingGroup.count({ where: { name } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_CREATED", userId: editor.id } }), 0);
    });

    await addReportingGroupMember(group.id, editor.id, "EDIT", actor(superAdmin));
    await addReportingGroupMember(group.id, admin.id, "ADMIN", actor(superAdmin));
    await check("DB: EDIT is read-only and failed administration changes nothing", async () => {
      assert.equal(await backofficePermissionForGroup(actor(editor), group.id), "EDIT");
      await assert.rejects(updateReportingGroup(group.id, { name: `${marker}-edited-by-editor`, active: false }, actor(editor)), /Nemáte oprávnění/);
      const stored = await prisma.reportingGroup.findUniqueOrThrow({ where: { id: group.id } });
      assert.equal(stored.name, `${marker}-group-a`); assert.equal(stored.active, true);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_UPDATED", userId: editor.id, entityId: group.id } }), 0);
    });
    await check("DB: ADMIN mutates own group but not an unrelated group", async () => {
      await updateReportingGroup(group.id, { name: `${marker}-group-a-admin`, description: "updated", active: true }, actor(admin));
      assert.equal((await prisma.reportingGroup.findUniqueOrThrow({ where: { id: group.id } })).name, `${marker}-group-a-admin`);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_UPDATED", userId: admin.id, entityId: group.id, entityType: "ReportingGroup" } }), 1);
      await assert.rejects(updateReportingGroup(unrelated.id, { name: `${marker}-forbidden-admin`, active: true }, actor(admin)), /Nemáte oprávnění/);
      assert.equal((await prisma.reportingGroup.findUniqueOrThrow({ where: { id: unrelated.id } })).name, `${marker}-group-b`);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_UPDATED", userId: admin.id, entityId: unrelated.id } }), 0);
    });

    const originalRole = member.role;
    await addReportingGroupMember(group.id, member.id, "VIEW", actor(admin));
    await check("DB: duplicate member add is friendly, unchanged, and unaudited", async () => {
      await assert.rejects(addReportingGroupMember(group.id, member.id, "ADMIN", actor(admin)), (error: unknown) => error instanceof Error && error.message === "Uživatel už je členem této reportovací skupiny." && !error.message.includes("P2002"));
      assert.equal((await prisma.reportingGroupMember.findUniqueOrThrow({ where: { reportingGroupId_userId: { reportingGroupId: group.id, userId: member.id } } })).permission, "VIEW");
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_MEMBER_ADDED", entityId: `${group.id}:${member.id}` } }), 1);
    });
    await check("DB: member add/update/remove is isolated from User and RENT grants", async () => {
      await changeReportingGroupMember(group.id, member.id, "update", "EDIT", actor(admin));
      assert.equal((await prisma.reportingGroupMember.findUniqueOrThrow({ where: { reportingGroupId_userId: { reportingGroupId: group.id, userId: member.id } } })).permission, "EDIT");
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_MEMBER_UPDATED", entityType: "ReportingGroupMember", entityId: `${group.id}:${member.id}` } }), 1);
      await changeReportingGroupMember(group.id, member.id, "remove", null, actor(admin));
      assert.equal(await prisma.reportingGroupMember.count({ where: { reportingGroupId: group.id, userId: member.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_MEMBER_REMOVED", entityType: "ReportingGroupMember", entityId: `${group.id}:${member.id}` } }), 1);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role, originalRole);
      assert.equal(await prisma.userProperty.count({ where: { userId: member.id } }), 0);
      assert.equal(await prisma.userUnit.count({ where: { userId: member.id } }), 0);
    });

    const first = await addReportingGroupPropertyInterval(group.id, { propertyId: property.id, effectiveFrom: parseReportingBusinessDate("2026-01-01")!, effectiveTo: parseReportingBusinessDate("2026-03-31")! }, actor(admin));
    const second = await addReportingGroupPropertyInterval(group.id, { propertyId: property.id, effectiveFrom: parseReportingBusinessDate("2026-04-01")!, effectiveTo: null }, actor(admin));
    await check("DB: adjacent and open-ended property intervals persist with exact audits", async () => {
      assert.equal(await prisma.reportingGroupProperty.count({ where: { reportingGroupId: group.id, propertyId: property.id } }), 2);
      for (const interval of [first, second]) assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_PROPERTY_ADDED", entityType: "ReportingGroupProperty", entityId: interval.id } }), 1);
    });
    await check("DB: overlapping interval is rejected without persistence or success audit", async () => {
      const auditCount = await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_PROPERTY_ADDED", userId: admin.id } });
      await assert.rejects(addReportingGroupPropertyInterval(group.id, { propertyId: property.id, effectiveFrom: parseReportingBusinessDate("2026-03-31")!, effectiveTo: parseReportingBusinessDate("2026-04-15")! }, actor(admin)), /nesmí překrývat/);
      assert.equal(await prisma.reportingGroupProperty.count({ where: { reportingGroupId: group.id, propertyId: property.id } }), 2);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORTING_GROUP_PROPERTY_ADDED", userId: admin.id } }), auditCount);
    });
  } finally {
    const fixtureUsers = users.map((user) => user.id);
    const fixtureGroups = await prisma.reportingGroup.findMany({ where: { name: { startsWith: marker } }, select: { id: true } });
    const groupIds = fixtureGroups.map((group) => group.id);
    const intervalIds = groupIds.length ? (await prisma.reportingGroupProperty.findMany({ where: { reportingGroupId: { in: groupIds } }, select: { id: true } })).map((row) => row.id) : [];
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: fixtureUsers } }, { entityId: { in: [...groupIds, ...intervalIds] } }] } });
    if (groupIds.length) { await prisma.reportingGroupProperty.deleteMany({ where: { reportingGroupId: { in: groupIds } } }); await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: { in: groupIds } } }); await prisma.reportingGroup.deleteMany({ where: { id: { in: groupIds } } }); }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
  }
}

async function main() {
  await check("VIEW has no backoffice access", () => assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "VIEW")), false));
  await check("EDIT has backoffice read access", () => assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "EDIT")), true));
  await check("EDIT cannot administer groups", () => assert.equal(canAdminReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "EDIT")), false));
  await check("ADMIN can administer own group", () => assert.equal(canAdminReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "ADMIN")), true));
  await check("SUPER_ADMIN can administer and create all groups", () => { assert.equal(canAdminReportingBackoffice(effectiveBackofficePermission("SUPER_ADMIN", null)), true); assert.equal(canCreateReportingGroup("SUPER_ADMIN"), true); });
  await check("navigation visibility follows preparation matrix", () => { assert.equal(reportingBackofficeNavVisible("OWNER_VIEWER", [{ permission: "VIEW" }]), false); assert.equal(reportingBackofficeNavVisible("OWNER_VIEWER", [{ permission: "EDIT" }]), true); assert.equal(reportingBackofficeNavVisible("OWNER_VIEWER", [{ permission: "ADMIN" }]), true); assert.equal(reportingBackofficeNavVisible("SUPER_ADMIN"), true); assert.match(shell, /hasReportingBackofficeAccess\(user\)/); });
  await check("reporting backoffice does not depend on RENT grants", () => { assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "EDIT")), true); assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("MANAGER", null)), false); assert.doesNotMatch(service, /accessibleProperties|UserProperty|userProperty|userUnit/); });
  await check("reporting ADMIN grants no RENT access", () => assert.deepEqual(reportingScopeForUser({ id: "u", role: "OWNER_VIEWER", reportingGroupMemberships: [{ reportingGroupId: "g", permission: "ADMIN" }] }), { mode: "SCOPED", wholePropertyIds: [], unitIds: [] }));
  await check("group creation is SUPER_ADMIN only", () => { assert.equal(canCreateReportingGroup("MANAGER"), false); assert.match(service, /canCreateReportingGroup\(user\.role\)/); });
  await check("member permissions remain VIEW EDIT ADMIN", () => assert.deepEqual(reportingGroupPermissions.slice().sort(), ["ADMIN", "EDIT", "VIEW"]));
  await check("member mutations do not alter UserRole or RENT memberships", () => { assert.doesNotMatch(service, /tx\.user\.update|userProperty\.(create|update|delete)|userUnit\.(create|update|delete)/); assert.match(service, /reportingGroupMember\.(create|update|delete)/); });
  await check("property interval mutations address intervalId", () => { assert.ok(routePaths.some((path) => path.includes("[intervalId]"))); assert.match(routes, /intervalId/); assert.match(service, /id: intervalId, reportingGroupId: groupId/); });
  const first = { effectiveFrom: parseReportingBusinessDate("2026-01-01")!, effectiveTo: parseReportingBusinessDate("2026-03-31")! }, adjacent = { effectiveFrom: parseReportingBusinessDate("2026-04-01")!, effectiveTo: null };
  await check("overlapping inclusive intervals are rejected", () => assert.throws(() => validateReportingGroupPropertyIntervals([first, { effectiveFrom: parseReportingBusinessDate("2026-03-31")!, effectiveTo: null }]), /overlap/));
  await check("adjacent inclusive intervals are accepted", () => assert.doesNotThrow(() => validateReportingGroupPropertyIntervals([first, adjacent])));
  await check("open-ended intervals are accepted", () => assert.doesNotThrow(() => validateReportingGroupPropertyIntervals([{ effectiveFrom: parseReportingBusinessDate("2026-04-01")!, effectiveTo: null }])));
  await check("effectiveFrom must not follow effectiveTo", () => assert.throws(() => validateReportingGroupPropertyIntervals([{ effectiveFrom: parseReportingBusinessDate("2026-04-01")!, effectiveTo: parseReportingBusinessDate("2026-03-31")! }]), /ends before/));
  await check("Prague date conversion is canonical and rejects invalid dates", () => { assert.equal(businessDateKey(parseReportingBusinessDate("2026-03-29")!), "2026-03-29"); assert.throws(() => parseReportingBusinessDate("2026-02-31"), /platný/); assert.match(service, /businessDateKeyToInstant/); });
  await check("groups and historical property intervals have no hard-delete behavior", () => { assert.doesNotMatch(service, /reportingGroup\.delete/); assert.doesNotMatch(service, /reportingGroupProperty\.delete/); assert.doesNotMatch(detail, /Odebrat interval|Smazat skupinu/); });
  await check("every mutation actor is session-derived", () => { assert.equal((routes.match(/requireUser\(\)/g) || []).length, 6); assert.doesNotMatch(routes, /form[^\n]*actorId|text\(form, "actor|text\(form, "createdById/); });
  await check("all required audit actions exist", () => { for (const action of ["REPORTING_GROUP_CREATED", "REPORTING_GROUP_UPDATED", "REPORTING_GROUP_MEMBER_ADDED", "REPORTING_GROUP_MEMBER_UPDATED", "REPORTING_GROUP_MEMBER_REMOVED", "REPORTING_GROUP_PROPERTY_ADDED", "REPORTING_GROUP_PROPERTY_UPDATED", "REPORTING_GROUP_PROPERTY_ENDED"]) assert.ok(service.includes(action), action); });
  await check("dashboard/detail expose no operational property links or data", () => { assert.doesNotMatch(dashboard + detail, /\/nemovitosti\/|units|leases|tenants|payments|documents/); assert.match(detail, /property: \{ select: \{ name: true, address: true, active: true \}/); });
  await check("LIVE report page remains operational and untouched", () => { const live = read("app/reporty/page.tsx"); assert.match(live, /loadLiveReport/); assert.match(live, /PortfolioScopePicker/); assert.doesNotMatch(live, /ReportingGroup|kvartalni/); });
  await check("Part 2A.2A verifier follows Part 2A.1 in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2a1\n      - run: npm run verify:v22-c-part2a2a\n      - run: npm run build")));
  await verifyDatabaseBehavior();
  console.log(`V22-C Part 2A.2A verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
