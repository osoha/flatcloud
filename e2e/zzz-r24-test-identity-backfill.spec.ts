import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("R24 requires local/CI DB"); });
test.afterAll(async () => { await prisma.$disconnect(); });
test("R24 backfill označí pouze osm známých identit bez změny práv nebo historie", async () => {
  const emails = Object.values(R24_ROLE_USERS);
  await prisma.user.updateMany({ where: { email: { in: emails } }, data: { isTestIdentity: false, title: null } });
  const lookalike = await prisma.user.create({ data: { email: "r24.unlisted@example.invalid", name: "R24 · TEST lookalike", role: "OWNER_VIEWER", passwordHash: "unusable-test-account" } });
  const select = { id: true, email: true, role: true, active: true, allProperties: true, title: true, memberships: { orderBy: { propertyId: "asc" as const } }, unitMemberships: { orderBy: { unitId: "asc" as const } } };
  const before = await prisma.user.findMany({ where: { email: { in: emails } }, select, orderBy: { id: "asc" } });
  const sql = readFileSync("prisma/migrations/20260908170000_r24_known_sandbox_identities/migration.sql", "utf8");
  expect(await prisma.$executeRawUnsafe(sql)).toBe(8);
  expect(await prisma.$executeRawUnsafe(sql)).toBe(0);
  expect(await prisma.user.findMany({ where: { email: { in: emails } }, select, orderBy: { id: "asc" } })).toEqual(before);
  expect(await prisma.user.count({ where: { email: { in: emails }, isTestIdentity: true } })).toBe(8);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: lookalike.id } })).isTestIdentity).toBe(false);
});
